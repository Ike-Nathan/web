import { apiFetch, isApiConfigured, type ApiError } from '@/lib/api'
import { addAlert, getAlerts, getAllAlerts } from '@/lib/storage'
import { isAlertRuleType, type AlertPayload, type Network } from '@/types'

/**
 * Assumed tx-watch-core contract (not verified against a live core):
 *   GET {NEXT_PUBLIC_API_URL}/alerts?contract_id=<id>&network=<net>[&since=<ms>]
 * responding with either `AlertPayload[]` or `{ alerts: AlertPayload[] }`,
 * where `timestamp` is epoch milliseconds. Polling is used (no SSE/WebSocket).
 */
export interface FetchAlertsOptions {
  since?: number
  signal?: AbortSignal
}

export const ALERT_POLL_INTERVAL_MS = 30000
/** Upper bound for the polling interval while the core keeps failing. */
export const ALERT_POLL_MAX_INTERVAL_MS = 5 * 60 * 1000


export async function fetchAlerts(
  contractId: string,
  network: Network | string,
  { since, signal }: FetchAlertsOptions = {}
): Promise<AlertPayload[]> {
  const qs = new URLSearchParams({
    contract_id: contractId,
    network: String(network),
  })
  if (since !== undefined) qs.set('since', String(since))
  const body = await apiFetch<unknown>(`/alerts?${qs.toString()}`, { signal })
  if (!body) return []
  const list = Array.isArray(body)
    ? body
    : ((body as { alerts?: unknown }).alerts ?? [])
  if (!Array.isArray(list))
    throw new Error('Invalid alerts response: expected an array of alerts')
  return list.map((entry, index) => {
    const result = validateAlertPayload(entry)
    if (typeof result === 'string') {
      throw new Error(`Invalid alerts response: entry ${index}: ${result}`)
    }
    return result
  })
}

/**
 * Returns the alert or an error message. The whole response is rejected on
 * any invalid entry so a core schema change never writes unusable records
 * into the local cache.
 */
export function validateAlertPayload(entry: unknown): AlertPayload | string {
  if (typeof entry !== 'object' || entry === null)
    return 'alert must be an object'
  const a = entry as Record<string, unknown>
  for (const key of [
    'label',
    'contract_id',
    'network',
    'transaction_hash',
    'horizon_link',
  ]) {
    if (typeof a[key] !== 'string') return `${key} must be a string`
  }
  if (!isAlertRuleType(a.rule_triggered))
    return `unknown rule_triggered "${String(a.rule_triggered)}"`
  if (typeof a.timestamp !== 'number' || !Number.isFinite(a.timestamp)) {
    return 'timestamp must be epoch milliseconds'
  }
  if (a.function_name !== undefined && typeof a.function_name !== 'string') {
    return 'function_name must be a string'
  }
  if (a.amount !== undefined && typeof a.amount !== 'number')
    return 'amount must be a number'
  if (a.is_test !== undefined && typeof a.is_test !== 'boolean')
    return 'is_test must be a boolean'
  return entry as AlertPayload
  const body = await apiFetch<
    AlertPayload[] | { alerts: AlertPayload[] } | undefined
  >(`/alerts?${qs.toString()}`, { signal })
  if (!body) return []
  return Array.isArray(body) ? body : (body.alerts ?? [])
}

/**
 * Stable local key for an alert: tx hash + rule + timestamp.
 * Used both for deduplication and for single-alert deletion, so every
 * stored alert is uniquely identifiable even though the core payload
 * carries no `id`.
 */
function alertKey(
  a: Pick<AlertPayload, 'transaction_hash' | 'rule_triggered' | 'timestamp'>
): string {
  return `${a.transaction_hash}::${a.rule_triggered}::${a.timestamp}`
}

/** Return the incoming alerts not already present, deduplicated by the stable key. */
export function filterNewAlerts(
  existing: AlertPayload[],
  incoming: AlertPayload[]
): AlertPayload[] {
  const seen = new Set(existing.map(alertKey))
  const fresh: AlertPayload[] = []
  for (const a of incoming) {
    const k = alertKey(a)
    if (seen.has(k)) continue
    seen.add(k)
    fresh.push(a)
  }
  return fresh
}

/**
 * Parse the cached `txwatch_alerts` array once and return the latest alert
 * timestamp per contract. Keyed by `${network}:${contract_id}` to avoid
 * cross-network mixing, and also by `contract_id` for backward compatibility.
 */
export function getLatestAlertTimestamps(alerts?: AlertPayload[]): Record<string, number> {
  const latest: Record<string, number> = {}
  const list = alerts ?? getAllAlerts()
  for (const alert of list) {
    const id = alert.contract_id
    if (!id) continue
    const ts = alert.timestamp
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue

    if (alert.network) {
      const netKey = `${alert.network}:${id}`
      if (latest[netKey] === undefined || ts > latest[netKey]) {
        latest[netKey] = ts
      }
    }
    if (latest[id] === undefined || ts > latest[id]) {
      latest[id] = ts
    }
  }
  return latest
}

/**
 * Fetch alerts from core and merge new ones into the local cache.
 * Returns the newly added alerts (oldest first).
 */
export async function syncAlerts(
  contractId: string,
  network: Network | string,
  opts: FetchAlertsOptions = {}
): Promise<AlertPayload[]> {
  const local = getAlerts(contractId)
  const since =
    opts.since ??
    (local.length ? Math.max(...local.map((a) => a.timestamp)) : undefined)
  const fetched = await fetchAlerts(contractId, network, { ...opts, since })
  const fresh = filterNewAlerts(local, fetched).sort(
    (a, b) => a.timestamp - b.timestamp
  )
  fresh.forEach((a) => addAlert(a))
  return fresh
}

export interface AlertPollHandlers {
  onSync?: (fresh: AlertPayload[], at: number) => void
  onError?: (error: unknown) => void
}

/**
 * Delay before the next poll: the base interval after a success, doubled per
 * consecutive failure (capped), and never sooner than a 429/503 Retry-After.
 */
export function nextPollDelay(
  intervalMs: number,
  failures: number,
  error?: unknown
): number {
  if (failures === 0) return intervalMs
  const backoff = Math.min(
    intervalMs * 2 ** failures,
    ALERT_POLL_MAX_INTERVAL_MS
  )
  const { status, retryAfterMs } = (error ?? {}) as Partial<ApiError>
  if ((status === 429 || status === 503) && retryAfterMs !== undefined) {
    return Math.max(backoff, retryAfterMs)
  }
  return backoff
}

/**
 * Poll syncAlerts on an interval, only while the page is visible.
 * Runs once immediately and backs off after consecutive failures.
 * Returns a stop function.
 */
export function startAlertPolling(
  contractId: string,
  network: Network | string,
  { onSync, onError }: AlertPollHandlers = {},
  intervalMs = ALERT_POLL_INTERVAL_MS
): () => void {
  let stopped = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight = false
  let failures = 0
  let delay = intervalMs

  const schedule = () => {
    if (stopped || !running || timer || inFlight) return
    timer = setTimeout(tick, delay)
  }
  const tick = async () => {
    timer = undefined
    if (stopped || inFlight) return
    inFlight = true
    try {
      const fresh = await syncAlerts(contractId, network)
      failures = 0
      delay = nextPollDelay(intervalMs, failures)
      if (!stopped) onSync?.(fresh, Date.now())
    } catch (e) {
      failures += 1
      delay = nextPollDelay(intervalMs, failures, e)
      if (!stopped) onError?.(e)
    } finally {
      inFlight = false
      schedule()
    }
  }
  const visible = () =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  const start = () => {
    if (running) return
    running = true
    if (!inFlight) void tick()
  }
  const pause = () => {
    running = false
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  const onVisibility = () => (visible() ? start() : pause())

  if (visible()) start()
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', onVisibility)
  return () => {
    stopped = true
    pause()
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisibility)
  }
}

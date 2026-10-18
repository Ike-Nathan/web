import { apiFetch, isApiConfigured } from '@/lib/api'
import { addAlert, getAlerts } from '@/lib/storage'
import type { AlertPayload, Network } from '@/types'

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

export async function fetchAlerts(
  contractId: string,
  network: Network | string,
  { since, signal }: FetchAlertsOptions = {}
): Promise<AlertPayload[]> {
  const qs = new URLSearchParams({ contract_id: contractId, network: String(network) })
  if (since !== undefined) qs.set('since', String(since))
  const body = await apiFetch<AlertPayload[] | { alerts: AlertPayload[] } | undefined>(
    `/alerts?${qs.toString()}`,
    { signal }
  )
  if (!body) return []
  return Array.isArray(body) ? body : body.alerts ?? []
}

/**
 * Stable local key for an alert: tx hash + rule + timestamp.
 * Used both for deduplication and for single-alert deletion, so every
 * stored alert is uniquely identifiable even though the core payload
 * carries no `id`.
 */
export function alertKey(
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
 * timestamp per contract id. Avoids re-parsing the whole array for every card
 * on every render (e.g. while typing in the search box).
 */
export function getLatestAlertTimestamps(): Record<string, number> {
  const latest: Record<string, number> = {}
  for (const alert of getAlerts()) {
    const id = alert.contract_id
    if (!id) continue
    const ts = alert.timestamp
    if (typeof ts !== 'number') continue
    if (latest[id] === undefined || ts > latest[id]) latest[id] = ts
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
    opts.since ?? (local.length ? Math.max(...local.map((a) => a.timestamp)) : undefined)
  const fetched = await fetchAlerts(contractId, network, { ...opts, since })
  const fresh = filterNewAlerts(local, fetched).sort((a, b) => a.timestamp - b.timestamp)
  fresh.forEach((a) => addAlert(a))
  return fresh
}

export interface AlertPollHandlers {
  onSync?: (fresh: AlertPayload[], at: number) => void
  onError?: (error: unknown) => void
}

/**
 * Poll syncAlerts on an interval, only while the page is visible.
 * Runs once immediately. Returns a stop function.
 */
export function startAlertPolling(
  contractId: string,
  network: Network | string,
  { onSync, onError }: AlertPollHandlers = {},
  intervalMs = ALERT_POLL_INTERVAL_MS
): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let inFlight = false

  const tick = async () => {
    if (stopped || inFlight) return
    inFlight = true
    try {
      const fresh = await syncAlerts(contractId, network)
      if (!stopped) onSync?.(fresh, Date.now())
    } catch (e) {
      if (!stopped) onError?.(e)
    } finally {
      inFlight = false
    }
  }
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  const start = () => {
    if (timer) return
    void tick()
    timer = setInterval(tick, intervalMs)
  }
  const pause = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  const onVisibility = () => (visible() ? start() : pause())

  if (visible()) start()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
  return () => {
    stopped = true
    pause()
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisibility)
  }
}

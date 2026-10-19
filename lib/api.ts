import { horizonUrl } from '@/lib/stellar'
import { SIGNATURE_HEADER, signWebhookPayload } from './webhookSignature'
import { sanitizeBodySnippet } from './bodySnippet'
import { getAuthorizationHeader, notifyAuthRequired } from './apiAuth'
import type { AlertPayload, AlertRule, Network } from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

/**
 * Whether the app is running in API mode, i.e. a backend API URL is
 * configured. Single source of truth for API-mode detection.
 */
export function isApiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_API_URL)
}

/** Default request timeout for apiFetch, in milliseconds. */
export const API_TIMEOUT_MS = 15000

/** Join a base URL and a path with exactly one slash between them. */
export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  if (!base) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** Non-2xx response from apiFetch, carrying the status and any Retry-After hint. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Parsed Retry-After header in milliseconds, when present. */
    readonly retryAfterMs?: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfter(
  value: string | null,
  now = Date.now()
): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (value.trim() !== '' && Number.isFinite(seconds))
    return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs = API_TIMEOUT_MS, ...init } = options ?? {}
  const headers = new Headers(init.headers)
  if (init.body != null && !headers.has('content-type')) {
    headers.set('Content-Type', 'application/json')
  }
  // Credentials go only to the core (relative paths), never to absolute URLs.
  if (!/^https?:\/\//i.test(path) && !headers.has('authorization')) {
    const authorization = await getAuthorizationHeader()
    if (authorization) headers.set('Authorization', authorization)
  }

  // Combine the caller's signal (if any) with a timeout signal.
  const controller = new AbortController()
  const onCallerAbort = () => controller.abort()
  if (init.signal) {
    if (init.signal.aborted) controller.abort()
    else init.signal.addEventListener('abort', onCallerAbort, { once: true })
  }
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(joinUrl(BASE_URL, path), {
      ...init,
      headers,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      let message = `HTTP ${res.status}`
      if (text) {
        try {
          const body = JSON.parse(text)
          message = body?.message || body?.error || text
        } catch {
          message = text
        }
      }
      if (res.status === 401) notifyAuthRequired()
      throw new ApiError(
        message,
        res.status,
        parseRetryAfter(res.headers?.get('retry-after') ?? null)
      )
    }

    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text) return undefined as T
    return JSON.parse(text) as T
  } catch (error) {
    if (
      (error as { name?: string })?.name === 'AbortError' &&
      !init.signal?.aborted
    ) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    init.signal?.removeEventListener('abort', onCallerAbort)
  }
}

/** Result of a test webhook delivery: the HTTP status and whether it succeeded. */
export interface TestWebhookResult {
  /** The receiver's HTTP status (not the proxy's). */
  status: number
  ok: boolean
  /** Round-trip time to the receiver, in milliseconds. */
  durationMs?: number
  /** Sanitised first bytes (max 1 KB) of a text response body. */
  bodySnippet?: string | null
  /** Why the delivery could not be made (e.g. blocked URL, timeout). */
  error?: string
}

/**
 * Syntactically valid but non-existent transaction hash (64 lowercase hex
 * chars) used for simulated alerts, so receivers that parse the hash do not
 * reject the payload before they can branch on the rule.
 */
export const TEST_TX_HASH = 'ab'.repeat(32)

/** Human-readable label for a rule, used in the test-payload rule picker. */
export function describeRule(rule: AlertRule): string {
  switch (rule.type) {
    case 'LargeTransfer':
      return `${rule.type} (over ${rule.threshold_xlm} XLM)`
    case 'FunctionCalled':
      return `${rule.type} (${rule.function_name.trim()})`
    case 'AdminFunctionCalled':
      return `${rule.type} (${rule.function_names.join(', ')})`
    default:
      return rule.type
  }
}

export interface BuildTestWebhookPayloadOptions {
  contractId: string
  network?: Network
  /** Configured rule to simulate. Defaults to `AnyTransaction`. */
  rule?: AlertRule
  label?: string
  /** Overridable for deterministic previews/tests; defaults to now. */
  timestamp?: number
  /** Overridable for deterministic previews/tests; defaults to `TEST_TX_HASH`. */
  transactionHash?: string
}

/**
 * Builds the JSON body sent to a webhook receiver for a test delivery.
 *
 * The payload mirrors a real alert for the simulated rule: `rule_triggered`
 * follows the rule, rule-specific fields (`function_name`, `amount`) are
 * filled in from its configuration, and `horizon_link` points at the network's
 * Horizon with the same hash carried in `transaction_hash`, so a receiver can
 * parse the link. `is_test: true` marks the delivery as simulated.
 */
export function buildTestWebhookPayload({
  contractId,
  network = 'testnet',
  rule,
  label = 'Test Alert',
  timestamp = Date.now(),
  transactionHash = TEST_TX_HASH,
}: BuildTestWebhookPayloadOptions): AlertPayload {
  const payload: AlertPayload = {
    label,
    contract_id: contractId,
    network,
    rule_triggered: rule?.type ?? 'AnyTransaction',
    transaction_hash: transactionHash,
    timestamp,
    horizon_link: `${horizonUrl(network)}/transactions/${transactionHash}`,
    is_test: true,
  }

  // Rule-specific fields match the variant tx-watch-core emits for that rule.
  switch (rule?.type) {
    case 'LargeTransfer':
      payload.amount = rule.threshold_xlm
      break
    case 'FunctionCalled':
      payload.function_name = rule.function_name.trim()
      break
    case 'AdminFunctionCalled':
      payload.function_name = rule.function_names[0]?.trim()
      break
    default:
      break
  }

  return payload
}

/**
 * The rule a test payload simulates, recovered from its rule-specific fields,
 * so the proxy can rebuild the same payload server-side (#261).
 */
export function ruleFromPayload(payload: AlertPayload): AlertRule | undefined {
  switch (payload.rule_triggered) {
    case 'LargeTransfer':
      return { type: 'LargeTransfer', threshold_xlm: payload.amount ?? 0 }
    case 'FunctionCalled':
      return {
        type: 'FunctionCalled',
        function_name: payload.function_name ?? '',
      }
    case 'AdminFunctionCalled':
      return {
        type: 'AdminFunctionCalled',
        function_names: [payload.function_name ?? ''],
      }
    case 'AnyTransaction':
    case 'TransactionFailed':
      return { type: payload.rule_triggered }
    default:
      return undefined
  }
}

interface SendTestWebhookTransport {
  /** Caller-owned signal, or a timeout in milliseconds (default 10000). */
  signalOrTimeoutMs?: AbortSignal | number
  /**
   * Signing secret for the delivery. When provided (e.g. the stored
   * `webhook_secret` of a watched contract), the request body is signed with
   * HMAC-SHA256 (timestamped, `t=…,v1=…`) and sent in the `SIGNATURE_HEADER` header.
   */
  secret?: string
}

export type SendTestWebhookOptions = SendTestWebhookTransport &
  /** Send a pre-built payload verbatim, e.g. the one shown in a preview. */
  (
    | { payload: AlertPayload }
    | ({ payload?: undefined } & BuildTestWebhookPayloadOptions)
  )

export async function sendTestWebhook(
  webhookUrl: string,
  options: SendTestWebhookOptions
): Promise<TestWebhookResult> {
  const { signalOrTimeoutMs = 10000, secret } = options
  const payload =
    'payload' in options && options.payload
      ? options.payload
      : buildTestWebhookPayload(options)

  const externalSignal =
    typeof signalOrTimeoutMs === 'number' ? undefined : signalOrTimeoutMs
  const timeoutMs =
    typeof signalOrTimeoutMs === 'number' ? signalOrTimeoutMs : 10000

  const internalController = new AbortController()
  let timedOut = false

  const timeoutId = setTimeout(() => {
    timedOut = true
    internalController.abort(new Error('timed out'))
  }, timeoutMs)

  const combinedController = new AbortController()

  const onCallerAbort = () => {
    clearTimeout(timeoutId)
    if (!combinedController.signal.aborted) {
      combinedController.abort(
        externalSignal?.reason || new Error('cancelled by caller')
      )
    }
  }

  const onTimeoutAbort = () => {
    if (!combinedController.signal.aborted) {
      combinedController.abort(new Error('timed out'))
    }
  }

  if (externalSignal?.aborted) {
    clearTimeout(timeoutId)
    combinedController.abort(
      externalSignal.reason || new Error('cancelled by caller')
    )
  } else {
    externalSignal?.addEventListener('abort', onCallerAbort, { once: true })
    internalController.signal.addEventListener('abort', onTimeoutAbort, {
      once: true,
    })
  }

  const signal = combinedController.signal

  try {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (secret)
      headers[SIGNATURE_HEADER] = await signWebhookPayload(secret, body)

    // In browser production, route through server proxy to avoid CORS failures (#23)
    const isBrowser = typeof window !== 'undefined'
    const useProxy = isBrowser && process.env.NODE_ENV !== 'test'

    if (useProxy) {
      const proxyRes = await fetch('/api/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The proxy builds the payload itself from these fields.
        body: JSON.stringify({
          url: webhookUrl,
          contractId: payload.contract_id,
          network: payload.network,
          rule: ruleFromPayload(payload),
          secret,
        }),
        signal,
      })
      // The proxy answers with the receiver's status, timing and body snippet
      // as JSON; its own HTTP status is not the receiver's.
      const data = (await proxyRes.json().catch(() => ({}))) as {
        status?: number
        ok?: boolean
        durationMs?: number
        bodySnippet?: string | null
        error?: string
      }
      return {
        status: typeof data.status === 'number' ? data.status : proxyRes.status,
        ok: data.ok === true,
        durationMs: data.durationMs,
        bodySnippet: data.bodySnippet ?? null,
        ...(data.error ? { error: data.error } : {}),
      }
    }

    const startedAt = Date.now()
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal,
    })
    const durationMs = Date.now() - startedAt
    let bodySnippet: string | null = null
    try {
      bodySnippet = sanitizeBodySnippet(
        new Uint8Array(await res.arrayBuffer()),
        res.headers.get('content-type')
      )
    } catch {
      // The status is what matters; a body that can't be read is not an error.
    }

    // The status is reported back rather than thrown on, so callers can show
    // the actual code; a non-2xx is still a failed delivery.
    return { status: res.status, ok: res.ok, durationMs, bodySnippet }
  } catch (error) {
    if (timedOut || internalController.signal.aborted) {
      throw new Error('Webhook request timed out')
    }
    if (externalSignal?.aborted) {
      throw new Error('Webhook request cancelled by caller')
    }
    const err = error as { name?: string; message?: string }
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      throw new Error('Webhook request timed out')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', onCallerAbort)
    internalController.signal.removeEventListener('abort', onTimeoutAbort)
  }
}

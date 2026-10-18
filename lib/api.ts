import { horizonUrl } from '@/lib/stellar'
import { SIGNATURE_HEADER, signWebhookPayload } from './webhookSignature'
import type { AlertPayload, AlertRule, Network } from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

/** Default request timeout for apiFetch, in milliseconds. */
export const API_TIMEOUT_MS = 15000

/** Join a base URL and a path with exactly one slash between them. */
export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  if (!base) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
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
      throw new Error(message)
    }

    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text) return undefined as T
    return JSON.parse(text) as T
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError' && !init.signal?.aborted) {
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
  status: number
  ok: boolean
  durationMs?: number
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

export interface TestWebhookPayloadOptions {
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
}: TestWebhookPayloadOptions): AlertPayload {
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

interface SendTestWebhookTransport {
  /** Caller-owned signal, or a timeout in milliseconds (default 10000). */
  signalOrTimeoutMs?: AbortSignal | number
  secret?: string
}

export type SendTestWebhookOptions = SendTestWebhookTransport &
  (
    /** Send a pre-built payload verbatim, e.g. the one shown in a preview. */
    | { payload: AlertPayload }
    | ({ payload?: undefined } & TestWebhookPayloadOptions)
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

  const externalSignal = typeof signalOrTimeoutMs === 'number' ? undefined : signalOrTimeoutMs
  const timeoutMs = typeof signalOrTimeoutMs === 'number' ? signalOrTimeoutMs : 10000

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
      combinedController.abort(externalSignal?.reason || new Error('cancelled by caller'))
    }
  }

  const onTimeoutAbort = () => {
    if (!combinedController.signal.aborted) {
      combinedController.abort(new Error('timed out'))
    }
  }

  if (externalSignal?.aborted) {
    clearTimeout(timeoutId)
    combinedController.abort(externalSignal.reason || new Error('cancelled by caller'))
  } else {
    externalSignal?.addEventListener('abort', onCallerAbort, { once: true })
    internalController.signal.addEventListener('abort', onTimeoutAbort, { once: true })
  }

  const signal = combinedController.signal

  try {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (secret) headers[SIGNATURE_HEADER] = await signWebhookPayload(secret, body)

    // In browser production, route through server proxy to avoid CORS failures (#23)
    const isBrowser = typeof window !== 'undefined'
    const useProxy = isBrowser && process.env.NODE_ENV !== 'test'

    let res: Response
    if (useProxy) {
      res = await fetch('/api/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, payload, secret }),
        signal,
      })
    } else {
      res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal,
      })
    }

    // The status is reported back rather than thrown on, so callers can show
    // the actual code; a non-2xx is still a failed delivery.
    return { status: res.status, ok: res.ok }
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

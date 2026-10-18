import { isValidFunctionName } from '@/lib/soroban'

export type Network = 'mainnet' | 'testnet' | 'futurenet'

export type AlertRuleType =
  | 'LargeTransfer'
  | 'AdminFunctionCalled'
  | 'AnyTransaction'
  | 'FunctionCalled'
  | 'TransactionFailed'

export const ALERT_RULE_TYPES: readonly AlertRuleType[] = [
  'LargeTransfer',
  'AdminFunctionCalled',
  'AnyTransaction',
  'FunctionCalled',
  'TransactionFailed',
]

export function isAlertRuleType(value: unknown): value is AlertRuleType {
  return typeof value === 'string' && (ALERT_RULE_TYPES as readonly string[]).includes(value)
}

/** Fields shared by every rule variant. `enabled` defaults to true when absent. */
interface AlertRuleBase {
  enabled?: boolean
}

/** Mirrors the `AlertRule` enum in tx-watch-core. */
export type AlertRule =
  | (AlertRuleBase & { type: 'LargeTransfer'; threshold_xlm: number })
  | (AlertRuleBase & { type: 'AdminFunctionCalled'; function_names: string[] })
  | (AlertRuleBase & { type: 'FunctionCalled'; function_name: string })
  | (AlertRuleBase & { type: 'AnyTransaction' })
  | (AlertRuleBase & { type: 'TransactionFailed' })

export function isRuleEnabled(rule: AlertRule): boolean {
  return rule.enabled !== false
}

/**
 * Validates untrusted data (e.g. from storage or an import file) as an AlertRule.
 * Returns the narrowed rule with only the fields valid for its type, or null.
 */
export function parseAlertRule(value: unknown): AlertRule | null {
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  if (!isAlertRuleType(r.type)) return null
  const base: AlertRuleBase = typeof r.enabled === 'boolean' ? { enabled: r.enabled } : {}
  switch (r.type) {
    case 'LargeTransfer':
      if (typeof r.threshold_xlm !== 'number' || !isFinite(r.threshold_xlm) || r.threshold_xlm < 0) return null
      return { ...base, type: r.type, threshold_xlm: r.threshold_xlm }
    case 'AdminFunctionCalled': {
      if (!Array.isArray(r.function_names) || !r.function_names.every((n) => typeof n === 'string')) return null
      const names = (r.function_names as string[]).map((n) => n.trim())
      if (!names.every((n) => isValidFunctionName(n))) return null
      return { ...base, type: r.type, function_names: names }
    }
    case 'FunctionCalled': {
      if (typeof r.function_name !== 'string') return null
      const name = r.function_name.trim()
      if (!isValidFunctionName(name)) return null
      return { ...base, type: r.type, function_name: name }
    }
    default:
      return { ...base, type: r.type }
  }
}

/**
 * Validates an untrusted webhook signing secret (e.g. from storage or an
 * import file). Returns the trimmed secret, or undefined when absent/invalid.
 */
export function parseWebhookSecret(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const secret = value.trim()
  return secret.length > 0 ? secret : undefined
}

export interface WatchedContract {
  id: string
  label: string
  contract_id: string
  network: Network
  rules: AlertRule[]
  webhook_url: string
  /** Optional signing secret used to sign webhook deliveries. */
  webhook_secret?: string
  /** Whether this contract is actively watched. Absent = true. */
  enabled?: boolean
  created_at: number
  updated_at: number
}

export interface AlertPayload {
  label: string
  contract_id: string
  network: string
  rule_triggered: string
  transaction_hash: string
  function_name?: string
  amount?: number
  timestamp: number
  horizon_link: string
  /** Set on simulated (test) deliveries so receivers can tell them from real
   *  alerts. Mirrored by the `is_test` field of tx-watch-core's payload. */
  is_test?: boolean
}

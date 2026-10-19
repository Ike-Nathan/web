import { apiFetch, isApiConfigured } from '@/lib/api'
import { apiFetch } from '@/lib/api'
import { validateContractEntry } from '@/lib/importSchema'
import {
  FUNCTION_NAME_REGEX,
  SOROBAN_SYMBOL_MAX_LENGTH,
  isValidFunctionName,
  sanitizeAdminFunctionNames,
} from '@/lib/soroban'
import type { WatchedContract } from '@/types'

/**
 * ASSUMED tx-watch-core REST routes (not verified against the core repo):
 *   GET    /contracts        -> WatchedContract[]
 *   POST   /contracts        -> WatchedContract   (body: WatchedContract)
 *   PUT    /contracts/:id    -> WatchedContract   (body: WatchedContract)
 *   DELETE /contracts/:id    -> 204 / empty body
 * Contract objects use the same shape as the local WatchedContract type.
 */

// Function-name validation lives in lib/soroban.ts; re-exported here so
// existing imports from '@/lib/contractsApi' keep working.
export {
  FUNCTION_NAME_REGEX,
  SOROBAN_SYMBOL_MAX_LENGTH,
  isValidFunctionName,
  sanitizeAdminFunctionNames,
}

/**
 * Filter params supported by the contracts page. The dashboard stat tiles
 * link to `/contracts?filter=alerts-today` and `/contracts?filter=webhooks`,
 * so the page needs to understand these values.
 */
export type ContractFilter = 'alerts-today' | 'webhooks'

export const CONTRACT_FILTERS: readonly ContractFilter[] = [
  'alerts-today',
  'webhooks',
]

export const CONTRACT_FILTER_LABELS: Record<ContractFilter, string> = {
  'alerts-today': 'Alerts today',
  webhooks: 'Active webhooks',
}

/**
 * Normalize an arbitrary `?filter=` value into a supported ContractFilter.
 * Returns null for missing/unknown values so callers can ignore them.
 */
export function parseContractFilter(
  value: string | null | undefined
): ContractFilter | null {
  if (!value) return null
  return (CONTRACT_FILTERS as readonly string[]).includes(value)
    ? (value as ContractFilter)
    : null
}

/**
 * Whether a contract has had an alert since local midnight.
 * Accepts the last-alert timestamp from the contract record; missing or
 * unparseable timestamps are treated as "no alert today".
 */
export function hasAlertSinceLocalMidnight(
  contract: WatchedContract,
  now: Date = new Date()
): boolean {
  const raw = (contract as { lastAlertAt?: string | null }).lastAlertAt
  if (!raw) return false
  const ts = new Date(raw).getTime()
  if (Number.isNaN(ts)) return false
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  return ts >= midnight
}

/**
 * Whether a contract has at least one active webhook configured.
 */
export function hasActiveWebhooks(contract: WatchedContract): boolean {
  const webhooks = (contract as { webhooks?: unknown }).webhooks
  if (!Array.isArray(webhooks)) return false
  return webhooks.some((hook) => {
    if (!hook || typeof hook !== 'object') return false
    return (hook as { active?: boolean }).active !== false
  })
}

/**
 * Apply a contracts-page filter to a list of contracts. Unknown filters
 * return the list unchanged.
 */
export function applyContractFilter(
  contracts: WatchedContract[],
  filter: ContractFilter | null,
  now: Date = new Date()
): WatchedContract[] {
  if (!filter) return contracts
  if (filter === 'alerts-today') {
    return contracts.filter((contract) =>
      hasAlertSinceLocalMidnight(contract, now)
    )
  }
  if (filter === 'webhooks') {
    return contracts.filter((contract) => hasActiveWebhooks(contract))
  }
  return contracts
}

export { isApiConfigured }

/**
 * Rejects the whole list if any entry fails validation, so callers keep the
 * local cache instead of replacing it with records that would later be dropped.
 */
export async function listContracts(): Promise<WatchedContract[]> {
  const body = await apiFetch<unknown>('/contracts')
  if (!Array.isArray(body))
    throw new Error('Invalid contracts response: expected an array')
  return body.map((entry, index) => {
    const result = validateContractEntry(entry)
    if (typeof result === 'string') {
      throw new Error(`Invalid contracts response: entry ${index}: ${result}`)
    }
    return result
  })
}

/**
 * Serialize a contract for the API payload. The full WatchedContract is sent,
 * including `webhook_secret` when present, so the secret is persisted.
 */
function serializeContract(contract: WatchedContract): string {
  const payload: WatchedContract = { ...contract }
  if (payload.webhook_secret === undefined) {
    delete payload.webhook_secret
  }
  return JSON.stringify(payload)
}

export function createContract(contract: WatchedContract): Promise<WatchedContract> {
export function createContract(
  contract: WatchedContract
): Promise<WatchedContract> {
  return apiFetch<WatchedContract>('/contracts', {
    method: 'POST',
    body: serializeContract(contract),
  })
}

export function updateContract(contract: WatchedContract): Promise<WatchedContract> {
  return apiFetch<WatchedContract>(`/contracts/${encodeURIComponent(contract.id)}`, {
    method: 'PUT',
    body: serializeContract(contract),
  })
export function updateContract(
  contract: WatchedContract
): Promise<WatchedContract> {
  return apiFetch<WatchedContract>(
    `/contracts/${encodeURIComponent(contract.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(contract),
    }
  )
}

export function removeContract(id: string): Promise<void> {
  return apiFetch<void>(`/contracts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

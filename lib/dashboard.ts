import { WatchedContract } from '@/types'
import { hasActiveWebhooks } from '@/lib/contractsApi'

export function isContractPaused(contract: { enabled?: boolean; paused?: boolean }): boolean {
  return contract.enabled === false || contract.paused === true
}

/**
 * Counts active webhooks across watched contracts.
 * Uses the canonical WatchedContract type from @/types.
 */
export function countActiveWebhooks(contracts: WatchedContract[]): number {
  return contracts.filter(hasActiveWebhooks).length
}

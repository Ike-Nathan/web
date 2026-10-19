import { isValidContractId, sorobanRpcUrl } from '@/lib/stellar'
import type { Network } from '@/types'

/**
 * Ledger key of a contract instance: the contract ID plus the zeroed 32-byte
 * instance key, base64-encoded. A contract that exists on the target network
 * has an entry under this key.
 */
export const CONTRACT_INSTANCE_KEY =
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

/** Default Soroban RPC timeout, in milliseconds. */
const CONTRACT_LOOKUP_TIMEOUT_MS = 8000

export type ContractLookupStatus = 'found' | 'not_found' | 'unavailable'

export interface ContractLookupResult {
  status: ContractLookupStatus
  /** Why the RPC could not be reached or answered with an error. */
  reason?: string
}

export interface ContractExistsOptions {
  /** Caller-owned signal, combined with the timeout. */
  signal?: AbortSignal
  timeoutMs?: number
}

/** Body of the Soroban RPC `getLedgerEntries` request for a contract instance. */
export function getLedgerEntriesRequest(contractId: string, id = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'getLedgerEntries',
    params: {
      keys: [{ contractInstance: { contractId, key: CONTRACT_INSTANCE_KEY } }],
    },
  })
}

/**
 * Checks whether a contract is deployed on the given network by asking that
 * network's Soroban RPC (from `SOROBAN_RPC_URLS` via `sorobanRpcUrl`) for its
 * contract instance ledger entry.
 *
 * Returns `not_found` only when the RPC answered authoritatively with no
 * entry. RPC errors, timeouts and unparsable answers return `unavailable`, so
 * a flaky endpoint never blocks the user from saving a contract.
 */
export async function contractExists(
  network: Network,
  contractId: string,
  { signal, timeoutMs = CONTRACT_LOOKUP_TIMEOUT_MS }: ContractExistsOptions = {}
): Promise<ContractLookupResult> {
  const id = contractId.trim()
  if (!isValidContractId(id)) return { status: 'not_found' }

  const controller = new AbortController()
  const onCallerAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onCallerAbort, { once: true })
  }
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(sorobanRpcUrl(network), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: getLedgerEntriesRequest(id),
      signal: controller.signal,
    })

    if (!res.ok) {
      return { status: 'unavailable', reason: `HTTP ${res.status}` }
    }

    const body = (await res.json()) as {
      result?: { entries?: unknown[] }
      error?: { message?: string } | string
    }

    if (body.error) {
      const reason =
        typeof body.error === 'string'
          ? body.error
          : (body.error.message ?? 'RPC error')
      return { status: 'unavailable', reason }
    }

    const entries = body.result?.entries
    if (!Array.isArray(entries)) {
      return { status: 'unavailable', reason: 'Unexpected RPC response' }
    }

    return { status: entries.length > 0 ? 'found' : 'not_found' }
  } catch (error) {
    const name = (error as { name?: string })?.name
    if (name === 'AbortError') {
      return signal?.aborted
        ? { status: 'unavailable', reason: 'Request cancelled' }
        : { status: 'unavailable', reason: 'RPC timed out' }
    }
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'RPC error',
    }
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onCallerAbort)
  }
}

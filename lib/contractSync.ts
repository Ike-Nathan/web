import type { WatchedContract } from '@/types'
import {
  getContracts,
  saveContract,
  deleteContract,
  replaceContracts,
  onContractsChange,
} from '@/lib/storage'
import {
  isApiConfigured,
  listContracts,
  createContract,
  updateContract,
  removeContract,
} from '@/lib/contractsApi'
import { CONTRACTS_KEY, SYNC_STATUS_KEY } from '@/lib/storageKeys'

export type SyncState = 'synced' | 'error'
export interface SyncStatus {
  state: SyncState
  error?: string
  at: number
}

/** Storage key used by the local contract cache; storage events on it signal cross-tab changes. */
export const CONTRACTS_STORAGE_KEY = CONTRACTS_KEY

/**
 * Re-exported from the storage layer so callers get a subscription that fires
 * for both same-tab and cross-tab contract cache writes.
 */
export { onContractsChange }

export function getSyncStatuses(): Record<string, SyncStatus> {
  try {
    return JSON.parse(localStorage.getItem(SYNC_STATUS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function setStatus(id: string, status: SyncStatus | null) {
  try {
    const all = getSyncStatuses()
    if (status) all[id] = status
    else delete all[id]
    localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(all))
  } catch {
    // status is best-effort
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Sync failed')

export interface SyncResult {
  ok: boolean
  /** Whether the local cache write succeeded. */
  localSaved?: boolean
  error?: string
}

/** Save locally (cache) and push to the API when configured. Never throws. */
export async function syncSaveContract(contract: WatchedContract, isNew: boolean): Promise<SyncResult> {
  const localSaved = saveContract(contract)
  if (!localSaved) {
    return { ok: false, localSaved: false, error: 'Storage full' }
  }
  if (!isApiConfigured()) return { ok: true, localSaved: true }
  try {
    await (isNew ? createContract(contract) : updateContract(contract))
    setStatus(contract.id, { state: 'synced', at: Date.now() })
    return { ok: true, localSaved: true }
  } catch (e) {
    const error = errMsg(e)
    setStatus(contract.id, { state: 'error', error, at: Date.now() })
    return { ok: false, localSaved: true, error }
  }
}

export async function syncDeleteContract(id: string): Promise<SyncResult> {
  deleteContract(id)
  setStatus(id, null)
  if (!isApiConfigured()) return { ok: true }
  try {
    await removeContract(id)
    return { ok: true }
  } catch (e) {
    // Local delete already happened; the next refresh restores it if the API still has it.
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * With an API configured, the API is the source of truth: replace the local
 * cache with its list, preserving server timestamps. Contracts that exist only
 * locally (e.g. created while offline) are kept and marked as pending upload
 * rather than deleted, so their alert history is not lost. On failure the
 * cache is kept and the error returned.
 */
export async function refreshContracts(): Promise<{ contracts: WatchedContract[]; error?: string }> {
  if (!isApiConfigured()) return { contracts: getContracts() }
  try {
    const remote = await listContracts()
    const remoteIds = new Set(remote.map((c) => c.id))
    const localOnly = getContracts().filter((c) => !remoteIds.has(c.id))
    replaceContracts([...remote, ...localOnly])
    remote.forEach((c) => {
      setStatus(c.id, { state: 'synced', at: Date.now() })
    })
    localOnly.forEach((c) => {
      setStatus(c.id, { state: 'error', error: 'Pending upload', at: Date.now() })
    })
    return { contracts: getContracts() }
  } catch (e) {
    return { contracts: getContracts(), error: errMsg(e) }
  }
}

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

/** Custom event to notify same-tab listeners when the sync status dictionary changes. */
const SYNC_STATUS_EVENT = 'txwatch:sync_status'

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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT))
    }
  } catch {
    // status is best-effort
  }
}

/** Subscribe to both same-tab and cross-tab sync status updates. */
export function onSyncStatusesChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleStorage = (e: StorageEvent) => {
    if (e.key === SYNC_STATUS_KEY) callback()
  }
  const handleLocal = () => callback()

  window.addEventListener('storage', handleStorage)
  window.addEventListener(SYNC_STATUS_EVENT, handleLocal)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(SYNC_STATUS_EVENT, handleLocal)
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Sync failed')

export interface SyncResult {
  ok: boolean
  error?: string
}

export function syncSaveContract(contract: WatchedContract, isNew: boolean): { saved: boolean, syncPromise: Promise<SyncResult> } {
  let saved = false;
  try {
    saved = saveContract(contract)
  } catch (err) {
    return { saved: false, syncPromise: Promise.resolve({ ok: false, error: errMsg(err) }) }
  }

  if (!saved) {
    return { saved: false, syncPromise: Promise.resolve({ ok: false, error: 'Storage full or unavailable' }) }
  }

  const syncPromise = (async () => {
    if (!isApiConfigured()) return { ok: true }
    try {
      await (isNew ? createContract(contract) : updateContract(contract))
      setStatus(contract.id, { state: 'synced', at: Date.now() })
      return { ok: true }
    } catch (e) {
      const error = errMsg(e)
      setStatus(contract.id, { state: 'error', error, at: Date.now() })
      return { ok: false, error }
    }
  })()

  return { saved, syncPromise }
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
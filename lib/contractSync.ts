import type { WatchedContract } from '@/types'
import {
  getContract,
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
import {
  CONTRACTS_KEY,
  SYNC_QUEUE_KEY,
  SYNC_STATUS_KEY,
} from '@/lib/storageKeys'

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

/** Fired on window whenever a contract's sync status changes. */
export const SYNC_STATUS_EVENT = 'txwatch:sync-status'

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
    if (typeof window !== 'undefined')
      window.dispatchEvent(new Event(SYNC_STATUS_EVENT))
  } catch {
    // status is best-effort
  }
}

/** Automatic retries stop after this many failed attempts; a manual retry starts over. */
export const SYNC_MAX_ATTEMPTS = 5
export const SYNC_RETRY_BASE_MS = 5000
export const SYNC_RETRY_MAX_MS = 5 * 60 * 1000

/** A create/update that failed and is waiting to be replayed (#253). */
export interface PendingSync {
  op: 'create' | 'update'
  contract: WatchedContract
  attempts: number
  nextAttemptAt: number
}

export function getSyncQueue(): Record<string, PendingSync> {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function updateQueue(mutate: (queue: Record<string, PendingSync>) => void) {
  try {
    const queue = getSyncQueue()
    mutate(queue)
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // queue is best-effort
  }
}

/** Exponential backoff: 5s, 10s, 20s, ... capped at 5 minutes. */
export function syncRetryDelay(attempts: number): number {
  return Math.min(
    SYNC_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1),
    SYNC_RETRY_MAX_MS
  )
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
  /** Whether the local cache write succeeded. */
  localSaved?: boolean
  error?: string
}

const inFlight = new Set<string>()

/**
 * Push one contract to the API. On failure the operation is queued with
 * backoff; on success any queued operation for the same contract version is
 * cleared.
 */
async function pushContract(
  op: PendingSync['op'],
  contract: WatchedContract,
  priorAttempts: number
): Promise<SyncResult> {
  // What is queued now is superseded by this push; anything queued while it
  // is in flight is newer and must be kept.
  const queuedBefore = JSON.stringify(getSyncQueue()[contract.id]?.contract)
  inFlight.add(contract.id)
  try {
    await (op === 'create'
      ? createContract(contract)
      : updateContract(contract))
    updateQueue((queue) => {
      if (
        queue[contract.id] &&
        JSON.stringify(queue[contract.id].contract) === queuedBefore
      ) {
        delete queue[contract.id]
      }
    })
    setStatus(contract.id, { state: 'synced', at: Date.now() })
    return { ok: true }
  } catch (e) {
    const attempts = priorAttempts + 1
    updateQueue((queue) => {
      queue[contract.id] = {
        op,
        contract,
        attempts,
        nextAttemptAt: Date.now() + syncRetryDelay(attempts),
      }
    })
    const error = errMsg(e)
    setStatus(contract.id, {
      state: 'error',
      error:
        attempts >= SYNC_MAX_ATTEMPTS
          ? `${error} (gave up after ${attempts} attempts)`
          : error,
      at: Date.now(),
    })
    return { ok: false, error }
  } finally {
    inFlight.delete(contract.id)
  }
}

/** Save locally (cache) and push to the API when configured. Never throws. */
export async function syncSaveContract(
  contract: WatchedContract,
  isNew: boolean
): Promise<SyncResult> {
  const localSaved = saveContract(contract)
  if (!localSaved) {
    return { ok: false, localSaved: false, error: 'Storage full' }
  }
  if (!isApiConfigured()) return { ok: true, localSaved: true }
  // A create that never reached the API must still be sent as a create.
  const op =
    isNew || getSyncQueue()[contract.id]?.op === 'create' ? 'create' : 'update'
  return { ...(await pushContract(op, contract, 0)), localSaved: true }
}

/**
 * Replay queued operations whose backoff has elapsed. `ignoreBackoff`
 * (used when the browser comes back online) retries them right away; entries
 * that hit SYNC_MAX_ATTEMPTS are left for a manual retry.
 */
export async function retryPendingSyncs({
  ignoreBackoff = false,
} = {}): Promise<void> {
  if (!isApiConfigured()) return
  const now = Date.now()
  for (const [id, entry] of Object.entries(getSyncQueue())) {
    if (inFlight.has(id) || entry.attempts >= SYNC_MAX_ATTEMPTS) continue
    if (!ignoreBackoff && entry.nextAttemptAt > now) continue
    if (!getContract(id)) {
      updateQueue((queue) => {
        delete queue[id]
      })
      continue
    }
    await pushContract(entry.op, entry.contract, entry.attempts)
  }
}

/** Manual retry from the card: retries now and restarts the attempt count. */
export async function retryContractSync(id: string): Promise<SyncResult> {
  if (!isApiConfigured()) return { ok: true }
  if (inFlight.has(id)) return { ok: false, error: 'Sync already in progress' }
  const entry = getSyncQueue()[id]
  const contract = getContract(id) ?? entry?.contract
  if (!contract) return { ok: false, error: 'Contract not found' }
  return pushContract(entry?.op ?? 'update', contract, 0)
}

/**
 * Replay the queue on load, when the browser comes back online, and
 * periodically while backoff timers elapse. Returns a stop function.
 */
export function startSyncRetries(): () => void {
  const run = (opts?: { ignoreBackoff?: boolean }) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    void retryPendingSyncs(opts)
  }
  const onOnline = () => run({ ignoreBackoff: true })
  run()
  const timer = setInterval(run, SYNC_RETRY_BASE_MS)
  window.addEventListener('online', onOnline)
  return () => {
    clearInterval(timer)
    window.removeEventListener('online', onOnline)
  }
}

export async function syncDeleteContract(id: string): Promise<SyncResult> {
  deleteContract(id)
  setStatus(id, null)
  updateQueue((queue) => {
    delete queue[id]
  })
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
export async function refreshContracts(): Promise<{
  contracts: WatchedContract[]
  error?: string
}> {
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
      setStatus(c.id, {
        state: 'error',
        error: 'Pending upload',
        at: Date.now(),
      })
    })
    return { contracts: getContracts() }
  } catch (e) {
    return { contracts: getContracts(), error: errMsg(e) }
  }
}

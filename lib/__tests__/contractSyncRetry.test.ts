import { vi } from 'vitest'

vi.mock('@/lib/contractsApi', () => ({
  isApiConfigured: () => true,
  listContracts: vi.fn(),
  createContract: vi.fn(),
  updateContract: vi.fn(),
  removeContract: vi.fn(),
}))

import { createContract, updateContract } from '@/lib/contractsApi'
import {
  SYNC_MAX_ATTEMPTS,
  getSyncQueue,
  getSyncStatuses,
  retryContractSync,
  retryPendingSyncs,
  startSyncRetries,
  syncDeleteContract,
  syncRetryDelay,
  syncSaveContract,
} from '@/lib/contractSync'
import type { WatchedContract } from '@/types'

const c = (id: string, label = id): WatchedContract => ({
  id,
  label,
  contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  network: 'testnet',
  rules: [],
  webhook_url: 'https://e.com',
  created_at: 1,
  updated_at: 1,
})

/** Flaky API: fails the first `failures` calls, then succeeds. */
function flaky(fn: typeof createContract, failures: number) {
  let calls = 0
  vi.mocked(fn).mockImplementation(async (contract) => {
    calls += 1
    if (calls <= failures) throw new Error('core unavailable')
    return contract
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('contract sync retries', () => {
  it('queues a failed create and replays it as a create once backoff elapses', async () => {
    flaky(createContract, 1)
    await syncSaveContract(c('a'), true)
    expect(getSyncStatuses().a.state).toBe('error')
    expect(getSyncQueue().a).toMatchObject({ op: 'create', attempts: 1 })

    await retryPendingSyncs()
    expect(createContract).toHaveBeenCalledTimes(1) // backoff not elapsed

    vi.advanceTimersByTime(syncRetryDelay(1))
    await retryPendingSyncs()
    expect(createContract).toHaveBeenCalledTimes(2)
    expect(getSyncQueue().a).toBeUndefined()
    expect(getSyncStatuses().a.state).toBe('synced')
  })

  it('backs off exponentially and stops after the max attempts', async () => {
    flaky(updateContract, Infinity)
    await syncSaveContract(c('a'), false)
    for (let i = 1; i < SYNC_MAX_ATTEMPTS + 3; i++) {
      vi.advanceTimersByTime(syncRetryDelay(i))
      await retryPendingSyncs()
    }
    expect(updateContract).toHaveBeenCalledTimes(SYNC_MAX_ATTEMPTS)
    expect(getSyncQueue().a.attempts).toBe(SYNC_MAX_ATTEMPTS)
    expect(getSyncStatuses().a.error).toMatch(/gave up after 5 attempts/)
    expect([1, 2, 3, 4].map(syncRetryDelay)).toEqual([
      5000, 10000, 20000, 40000,
    ])
    expect(syncRetryDelay(20)).toBe(5 * 60 * 1000)
  })

  it('keeps a never-synced create as a create when the contract is edited', async () => {
    flaky(createContract, 1)
    vi.mocked(updateContract).mockRejectedValue(new Error('404'))
    await syncSaveContract(c('a'), true)
    await syncSaveContract(c('a', 'renamed'), false)
    expect(updateContract).not.toHaveBeenCalled()
    expect(getSyncQueue()).toEqual({})
  })

  it('manual Retry runs immediately and restarts after giving up', async () => {
    flaky(updateContract, SYNC_MAX_ATTEMPTS)
    await syncSaveContract(c('a'), false)
    for (let i = 1; i < SYNC_MAX_ATTEMPTS; i++) {
      vi.advanceTimersByTime(syncRetryDelay(i))
      await retryPendingSyncs()
    }
    expect(getSyncQueue().a.attempts).toBe(SYNC_MAX_ATTEMPTS)
    expect(await retryContractSync('a')).toEqual({ ok: true })
    expect(getSyncStatuses().a.state).toBe('synced')
  })

  it('replays on load and on the online event, ignoring backoff', async () => {
    flaky(updateContract, 2)
    await syncSaveContract(c('a'), false)
    const stop = startSyncRetries()
    await vi.advanceTimersByTimeAsync(0)
    expect(updateContract).toHaveBeenCalledTimes(1) // load: backoff still pending

    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(updateContract).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(updateContract).toHaveBeenCalledTimes(3)
    expect(getSyncQueue().a).toBeUndefined()
    stop()
  })

  it('drops the queued operation when the contract is deleted', async () => {
    flaky(updateContract, Infinity)
    await syncSaveContract(c('a'), false)
    await syncDeleteContract('a')
    expect(getSyncQueue()).toEqual({})
  })
})

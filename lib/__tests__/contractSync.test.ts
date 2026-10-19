import { vi } from 'vitest'
import {
  syncSaveContract, syncDeleteContract, refreshContracts, getSyncStatuses,
  onContractsChange,
} from '../contractSync'
import * as storage from '../storage'
import { getContracts } from '../storage'
import type { WatchedContract } from '@/types'

const c = (id: string): WatchedContract => ({
  id, label: id, contract_id: 'C' + 'A'.repeat(55), network: 'testnet',
  rules: [], webhook_url: 'https://e.com', created_at: 1, updated_at: 1,
})

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllEnvs())

describe('contractSync', () => {
  it('is localStorage-only when the API URL is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    const result = await syncSaveContract(c('a'), true)
    expect(result.localSaved).toBe(true)
    expect(getContracts()).toHaveLength(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns the local save result from saveContract', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    const spy = vi.spyOn(storage, 'saveContract').mockReturnValue(false)
    const result = await syncSaveContract(c('a'), true)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.localSaved).toBe(false)
    spy.mockRestore()
  })

  it('POSTs new contracts and marks them synced', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api')
    ;(fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })
    await syncSaveContract(c('a'), true)
    expect((fetch as any).mock.calls[0][1].method).toBe('POST')
    expect(getSyncStatuses().a.state).toBe('synced')
  })

  it('records per-contract errors but keeps the local copy', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api')
    ;(fetch as any).mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    await syncSaveContract(c('a'), false)
    expect(getContracts()).toHaveLength(1)
    expect(getSyncStatuses().a).toMatchObject({ state: 'error', error: 'boom' })
  })

  it('re-exports the storage-layer onContractsChange', () => {
    expect(onContractsChange).toBe(storage.onContractsChange)
  })

  it('refresh replaces the cache with the API list', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api')
    await syncSaveContract(c('old'), true).catch(() => {})
    ;(fetch as any).mockResolvedValue({ ok: true, json: async () => [c('new')] })
    const r = await refreshContracts()
    expect(r.contracts.map((x) => x.id)).toEqual(['new'])
  })

  it('refresh preserves remote updated_at values', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api')
    const remote = { ...c('new'), updated_at: 12345 }
    ;(fetch as any).mockResolvedValue({ ok: true, json: async () => [remote] })
    const r = await refreshContracts()
    expect(r.contracts[0].updated_at).toBe(12345)
    expect(getContracts()[0].updated_at).toBe(12345)
  })

  it('refresh keeps local-only contracts as pending upload instead of deleting them', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api')
    ;(fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })
    await syncSaveContract(c('local'), true)
    ;(fetch as any).mockResolvedValue({ ok: true, json: async () => [c('remote')] })
    const r = await refreshContracts()
    const ids = r.contracts.map((x) => x.id)
    expect(ids).toContain('local')
    expect(ids).toContain('remote')
    expect(getContracts().map((x) => x.id)).toContain('local')
    expect(r.pendingUpload?.map((x) => x.id)).toContain('local')
  })

  it('refresh keeps the cache on failure', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api')
    ;(fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })
    await syncSaveContract(c('a'), true)
    ;(fetch as any).mockRejectedValue(new Error('down'))
    const r = await refreshContracts()
    expect(r.error).toBe('down')
    expect(r.contracts).toHaveLength(1)
  })

  it('delete removes locally and calls DELETE', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api')
    ;(fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })
    await syncSaveContract(c('a'), true)
    await syncDeleteContract('a')
    expect(getContracts()).toHaveLength(0)
    expect((fetch as any).mock.calls.at(-1)[1].method).toBe('DELETE')
  })
})

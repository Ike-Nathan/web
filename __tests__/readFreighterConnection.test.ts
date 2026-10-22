import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}))

import * as freighterApi from '@stellar/freighter-api'
import { readFreighterConnection } from '../lib/freighter'

const api = vi.mocked(freighterApi)

describe('readFreighterConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.isConnected.mockResolvedValue({ isConnected: true } as never)
    api.getNetworkDetails.mockResolvedValue({
      network: 'TESTNET',
      networkPassphrase: 'Test SDF Network ; September 2015',
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('returns null (unreachable) when getAddress never settles', async () => {
    api.getAddress.mockReturnValue(new Promise(() => {}) as never)

    const result = readFreighterConnection()
    await vi.runAllTimersAsync()

    await expect(result).resolves.toBeNull()
  })

  it('returns null (unreachable) when getAddress rejects', async () => {
    api.getAddress.mockRejectedValue(new Error('extension crashed'))

    await expect(readFreighterConnection()).resolves.toBeNull()
  })

  it('reports a locked wallet as a null publicKey, not as unreachable', async () => {
    api.getAddress.mockResolvedValue({
      address: '',
      error: { code: -1, message: 'locked' },
    } as never)

    await expect(readFreighterConnection()).resolves.toEqual({
      publicKey: null,
      network: null,
      networkPassphrase: null,
    })
  })

  it('returns the address and network when the wallet answers', async () => {
    api.getAddress.mockResolvedValue({ address: 'GABC' } as never)

    await expect(readFreighterConnection()).resolves.toEqual({
      publicKey: 'GABC',
      network: 'TESTNET',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
  })
})

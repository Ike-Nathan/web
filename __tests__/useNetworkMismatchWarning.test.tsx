import { vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  networkMismatchWarning,
  useNetworkMismatchWarning,
} from '@/lib/useNetworkMismatchWarning'
import { FREIGHTER_NETWORK_BY_CHAIN, freighterNetworkForChain } from '@/lib/freighter'

const mockIsConnected = vi.fn()
const mockGetAddress = vi.fn()
const mockGetNetworkDetails = vi.fn()

vi.mock('@stellar/freighter-api', () => ({
  isConnected: (...args: unknown[]) => mockIsConnected(...args),
  getAddress: (...args: unknown[]) => mockGetAddress(...args),
  getNetworkDetails: (...args: unknown[]) => mockGetNetworkDetails(...args),
}))

function mockWallet(network: string) {
  mockIsConnected.mockResolvedValue({ isConnected: true })
  mockGetAddress.mockResolvedValue({ address: 'GABC' })
  mockGetNetworkDetails.mockResolvedValue({ network, networkPassphrase: '' })
}

describe('networkMismatchWarning', () => {
  it('maps Freighter network names and warns on mismatch', () => {
    expect(networkMismatchWarning('TESTNET', 'testnet')).toBeNull()
    expect(networkMismatchWarning('PUBLIC', 'mainnet')).toBeNull()
    expect(networkMismatchWarning('FUTURENET', 'futurenet')).toBeNull()
    expect(networkMismatchWarning('PUBLIC', 'testnet')).toBe(
      'Your wallet is on PUBLIC, but this contract is on TESTNET'
    )
    expect(networkMismatchWarning('TESTNET', 'mainnet')).toBe(
      'Your wallet is on TESTNET, but this contract is on MAINNET'
    )
  })

  it('covers every network in both directions', () => {
    for (const [chain, freighterNetwork] of Object.entries(FREIGHTER_NETWORK_BY_CHAIN)) {
      expect(freighterNetworkForChain(chain)).toBe(freighterNetwork)
      expect(networkMismatchWarning(freighterNetwork, chain)).toBeNull()

      for (const [otherChain, otherFreighterNetwork] of Object.entries(
        FREIGHTER_NETWORK_BY_CHAIN
      )) {
        if (otherChain === chain) continue
        expect(networkMismatchWarning(freighterNetwork, otherChain)).toBe(
          `Your wallet is on ${freighterNetwork}, but this contract is on ${otherChain.toUpperCase()}`
        )
        expect(networkMismatchWarning(otherFreighterNetwork, chain)).toBe(
          `Your wallet is on ${otherFreighterNetwork}, but this contract is on ${chain.toUpperCase()}`
        )
      }
    }
  })
})

describe('useNetworkMismatchWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('warns on the initial mount when the wallet network differs', async () => {
    mockWallet('PUBLIC')

    const { result } = renderHook(() => useNetworkMismatchWarning('testnet', true))

    await waitFor(() =>
      expect(result.current.networkWarning).toBe(
        'Your wallet is on PUBLIC, but this contract is on TESTNET'
      )
    )
  })

  it('stays quiet on mount when the networks match', async () => {
    mockWallet('TESTNET')

    const { result } = renderHook(() => useNetworkMismatchWarning('testnet', true))

    await waitFor(() => expect(mockGetNetworkDetails).toHaveBeenCalled())
    expect(result.current.networkWarning).toBeNull()
  })

  it('re-checks when the selected network changes', async () => {
    mockWallet('TESTNET')

    const { result, rerender } = renderHook(
      ({ network }: { network: 'testnet' | 'mainnet' }) =>
        useNetworkMismatchWarning(network, true),
      { initialProps: { network: 'testnet' as const } }
    )

    await waitFor(() => expect(result.current.networkWarning).toBeNull())

    rerender({ network: 'mainnet' })

    await waitFor(() =>
      expect(result.current.networkWarning).toBe(
        'Your wallet is on TESTNET, but this contract is on MAINNET'
      )
    )
  })

  it('warns after the wallet connects, without waiting for a network change', async () => {
    // No extension yet: the page renders the Connect button and has no wallet
    // network to compare against.
    const { result, rerender } = renderHook(
      ({ connected }: { connected: boolean }) => useNetworkMismatchWarning('testnet', connected),
      { initialProps: { connected: false } }
    )

    expect(result.current.networkWarning).toBeNull()

    mockWallet('PUBLIC')
    rerender({ connected: true })

    await waitFor(() =>
      expect(result.current.networkWarning).toBe(
        'Your wallet is on PUBLIC, but this contract is on TESTNET'
      )
    )
  })

  it('checks immediately when asked, e.g. from the connect handler', async () => {
    const { result } = renderHook(() => useNetworkMismatchWarning('testnet', true))
    expect(result.current.networkWarning).toBeNull()

    mockWallet('PUBLIC')
    await result.current.checkNetworkMismatch()

    await waitFor(() =>
      expect(result.current.networkWarning).toBe(
        'Your wallet is on PUBLIC, but this contract is on TESTNET'
      )
    )
  })

  it('clears the warning when the wallet disconnects', async () => {
    mockWallet('PUBLIC')

    const { result } = renderHook(() => useNetworkMismatchWarning('testnet', true))
    await waitFor(() => expect(result.current.networkWarning).not.toBeNull())

    result.current.clearNetworkWarning()

    expect(result.current.networkWarning).toBeNull()
  })

  it('clears the warning when getNetworkDetails rejects (locked or disconnected wallet)', async () => {
    mockWallet('PUBLIC')

    const { result, rerender } = renderHook(
      ({ network }: { network: 'testnet' | 'mainnet' }) =>
        useNetworkMismatchWarning(network, true),
      { initialProps: { network: 'testnet' as const } }
    )
    await waitFor(() => expect(result.current.networkWarning).not.toBeNull())

    mockGetNetworkDetails.mockRejectedValue(new Error('locked'))
    rerender({ network: 'mainnet' })

    await waitFor(() => expect(result.current.networkWarning).toBeNull())
  })
})

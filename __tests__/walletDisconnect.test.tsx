import { vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FreighterConnect from '@/components/FreighterConnect'
import WalletStatusBadge from '@/components/WalletStatusBadge'
import { useFreighterConnection } from '@/lib/useFreighterConnection'
import { publishWalletChange, subscribeWallet } from '@/lib/walletEvents'

const MOCK_PUBLIC_KEY =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const TRUNCATED_KEY = /GAAA\.\.\.AAAA/

const freighterApiMock = vi.hoisted(() => ({
  isConnected: vi.fn(),
  getPublicKey: vi.fn(),
  getNetwork: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}))

vi.mock('@stellar/freighter-api', () => freighterApiMock)

function mockFreighter(isConnected: boolean) {
  freighterApiMock.isConnected.mockResolvedValue({ isConnected })
  freighterApiMock.getPublicKey.mockResolvedValue({
    publicKey: MOCK_PUBLIC_KEY,
  })
  freighterApiMock.getNetwork.mockResolvedValue({ network: 'TESTNET' })
  freighterApiMock.requestAccess.mockResolvedValue({
    publicKey: MOCK_PUBLIC_KEY,
  })
}

function mockFreighterMissing() {
  freighterApiMock.isConnected.mockResolvedValue({ isConnected: false })
  freighterApiMock.getPublicKey.mockResolvedValue({
    error: { message: 'Freighter is not installed' },
  })
  freighterApiMock.getNetwork.mockResolvedValue({
    error: { message: 'Freighter is not installed' },
  })
  freighterApiMock.requestAccess.mockResolvedValue({
    error: { message: 'Freighter is not installed' },
  })
}

describe('wallet state broadcast', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockFreighterMissing()
  })

  // The header and the landing page each render their own FreighterConnect, so
  // a disconnect in one of them has to reach the other plus the status badge.
  it('updates the badge, both connect buttons and the global on disconnect', async () => {
    mockFreighter(true)

    render(
      <>
        <WalletStatusBadge />
        <FreighterConnect />
        <FreighterConnect />
      </>
    )

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getAllByText(TRUNCATED_KEY)).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0])

    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Connect Freighter/ })
      ).toHaveLength(2)
    })
    expect(screen.queryByText(TRUNCATED_KEY)).not.toBeInTheDocument()
    expect(localStorage.getItem('freighter_public_key')).toBeNull()
  })

  it('updates the badge and the other button on connect', async () => {
    mockFreighter(false)

    render(
      <>
        <WalletStatusBadge />
        <FreighterConnect />
        <FreighterConnect />
      </>
    )

    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Connect Freighter/ })
      ).toHaveLength(2)
    })
    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getAllByRole('button', { name: /Connect Freighter/ })[0]
    )

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getAllByText(TRUNCATED_KEY)).toHaveLength(2)
    })
    expect(
      screen.queryAllByRole('button', { name: /Connect Freighter/ })
    ).toHaveLength(0)
  })

  it('re-opens the new-contract gate after a disconnect made elsewhere', async () => {
    mockFreighter(true)

    function NewContractGate() {
      const { isConnected } = useFreighterConnection()
      return isConnected ? (
        <p>Connect a wallet to save</p>
      ) : (
        <p>Wallet required</p>
      )
    }

    render(
      <>
        <FreighterConnect />
        <NewContractGate />
      </>
    )

    await waitFor(() => {
      expect(screen.getByText('Connect a wallet to save')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => {
      expect(screen.getByText('Wallet required')).toBeInTheDocument()
    })
  })

  it('does not re-fire onConnect in a loop when the parent re-renders', async () => {
    mockFreighter(false)
    const onConnect = vi.fn()

    // An inline arrow is a new function on every parent render, which is how
    // real callers pass this callback. A parent that sets state from it must
    // not be able to drive this component into a render loop.
    function Parent() {
      const [ticks, setTicks] = useState(0)
      return (
        <>
          <FreighterConnect
            onConnect={() => {
              onConnect()
              setTicks((t) => t + 1)
            }}
          />
          <span data-testid="ticks">{ticks}</span>
        </>
      )
    }

    render(<Parent />)

    fireEvent.click(
      await screen.findByRole('button', { name: /Connect Freighter/ })
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Disconnect' })
      ).toBeInTheDocument()
    })
    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('ticks')).toHaveTextContent('1')
  })

  it('leaves the badge unavailable when the extension is missing', () => {
    mockFreighterMissing()

    render(<WalletStatusBadge />)

    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })

  it('delivers a wallet change published in one tab to another tab', async () => {
    const received: Array<{ publicKey: string | null }> = []
    const unsubscribe = subscribeWallet((detail) => {
      received.push({ publicKey: detail.publicKey })
    })

    // A second, independent channel instance stands in for another tab.
    const otherTab = new BroadcastChannel('txwatch-wallet')
    const otherTabMessages: Array<{ publicKey: string | null }> = []
    otherTab.onmessage = (event) => {
      otherTabMessages.push({ publicKey: event.data.publicKey })
    }

    publishWalletChange(null)

    await waitFor(() => {
      expect(received).toEqual([{ publicKey: null }])
    })
    await waitFor(() => {
      expect(otherTabMessages).toEqual([{ publicKey: null }])
    })

    unsubscribe()
    otherTab.close()
  })

  it('falls back to the local event when BroadcastChannel is unavailable', async () => {
    const original = globalThis.BroadcastChannel
    // @ts-expect-error - simulate an environment without BroadcastChannel
    delete globalThis.BroadcastChannel

    try {
      const received: Array<{ publicKey: string | null }> = []
      const unsubscribe = subscribeWallet((detail) => {
        received.push({ publicKey: detail.publicKey })
      })

      expect(() => publishWalletChange(MOCK_PUBLIC_KEY)).not.toThrow()

      await waitFor(() => {
        expect(received).toEqual([{ publicKey: MOCK_PUBLIC_KEY }])
      })

      unsubscribe()
    } finally {
      globalThis.BroadcastChannel = original
    }
  })

  it('still broadcasts wallet changes when localStorage throws', async () => {
    mockFreighter(true)

    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
    const removeItemSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })

    const walletEvents: Array<{ publicKey: string | null }> = []
    const listener = (event: Event) => {
      walletEvents.push(
        (event as CustomEvent<{ publicKey: string | null }>).detail
      )
    }
    window.addEventListener('txwatch:wallet', listener)

    try {
      render(
        <>
          <WalletStatusBadge />
          <FreighterConnect />
          <FreighterConnect />
        </>
      )

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })
      await waitFor(() => {
        expect(screen.getAllByText(TRUNCATED_KEY)).toHaveLength(2)
      })

      fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0])

      await waitFor(() => {
        expect(screen.getByText('Disconnected')).toBeInTheDocument()
      })
      await waitFor(() => {
        expect(
          screen.getAllByRole('button', { name: /Connect Freighter/ })
        ).toHaveLength(2)
      })

      expect(walletEvents.length).toBeGreaterThan(0)
      expect(walletEvents[walletEvents.length - 1]).toEqual({
        publicKey: null,
      })
    } finally {
      window.removeEventListener('txwatch:wallet', listener)
      setItemSpy.mockRestore()
      removeItemSpy.mockRestore()
    }
  })
})

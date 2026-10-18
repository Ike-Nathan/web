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

function mockFreighter(isConnected: boolean) {
  window.freighter = {
    isConnected: vi.fn().mockResolvedValue(isConnected),
    getPublicKey: vi.fn().mockResolvedValue(MOCK_PUBLIC_KEY),
    getNetwork: vi.fn().mockResolvedValue('TESTNET'),
  }
}

describe('wallet state broadcast', () => {
  beforeEach(() => {
    delete window.freighter
    delete window.__freighterPublicKey
    localStorage.clear()
    vi.clearAllMocks()
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
    expect(window.__freighterPublicKey).toBe(MOCK_PUBLIC_KEY)

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
    expect(window.__freighterPublicKey).toBeUndefined()
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
    expect(window.__freighterPublicKey).toBe(MOCK_PUBLIC_KEY)
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
    delete window.freighter

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
})

import { vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import WalletStatusBadge from '@/components/WalletStatusBadge'

describe('WalletStatusBadge', () => {
  beforeEach(() => {
    delete (window as any).freighter
    vi.clearAllMocks()
  })

  it('shows a neutral checking state while isConnected is pending', async () => {
    let resolve: (value: boolean) => void = () => {}
    ;(window as any).freighter = {
      isConnected: vi.fn().mockReturnValue(new Promise<boolean>((r) => { resolve = r })),
    }

    render(<WalletStatusBadge />)

    // No grey "Unavailable" flash before the answer arrives.
    expect(screen.getByRole('status', { name: /checking wallet status/i })).toBeInTheDocument()
    expect(screen.getByText('Checking…')).toBeInTheDocument()
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()

    await act(async () => {
      resolve(true)
    })
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('renders Connected when isConnected resolves true', async () => {
    ;(window as any).freighter = { isConnected: vi.fn().mockResolvedValue(true) }

    render(<WalletStatusBadge />)

    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument())
  })

  it('renders Disconnected when isConnected resolves false', async () => {
    ;(window as any).freighter = { isConnected: vi.fn().mockResolvedValue(false) }

    render(<WalletStatusBadge />)

    await waitFor(() => expect(screen.getByText('Disconnected')).toBeInTheDocument())
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
  })

  it('falls back to Disconnected when isConnected rejects', async () => {
    const rejection = vi.fn().mockRejectedValue(new Error('Freighter is not responding'))
    ;(window as any).freighter = { isConnected: rejection }

    render(<WalletStatusBadge />)

    await waitFor(() => expect(screen.getByText('Disconnected')).toBeInTheDocument())
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
    // The rejection is handled, not left unhandled.
    expect(rejection).toHaveBeenCalledTimes(1)
  })

  it('renders Unavailable when the extension is missing', async () => {
    render(<WalletStatusBadge />)

    await waitFor(() => expect(screen.getByText('Unavailable')).toBeInTheDocument())
  })

  it('does not update after unmount', async () => {
    let resolve: (value: boolean) => void = () => {}
    ;(window as any).freighter = {
      isConnected: vi.fn().mockReturnValue(new Promise<boolean>((r) => { resolve = r })),
    }

    const { unmount } = render(<WalletStatusBadge />)
    unmount()

    // The late answer is ignored instead of updating an unmounted component.
    await act(async () => {
      resolve(true)
    })
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
  })
})

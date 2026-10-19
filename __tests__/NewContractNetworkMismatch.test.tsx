import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NewContractPage from '@/app/contracts/new/page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/contractSync', () => ({
  syncSaveContract: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/storage', () => ({
  getContracts: vi.fn().mockReturnValue([]),
  addContract: vi.fn(),
  saveContract: vi.fn().mockReturnValue(true),
}))

describe('NewContractPage - Network Mismatch & Acknowledgement (#12, #13)', () => {
  beforeEach(() => {
    delete (window as any).freighter
    delete (window as any).__freighterPublicKey
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('detects network mismatch automatically on initial mount when connected', async () => {
    ;(window as any).freighter = {
      isConnected: vi.fn().mockResolvedValue(true),
      getPublicKey: vi.fn().mockResolvedValue('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      getNetwork: vi.fn().mockResolvedValue('PUBLIC'),
    }

    render(<NewContractPage />)

    // Default network is testnet, wallet is on PUBLIC -> mismatch warning should appear without dropdown change
    await waitFor(() => {
      expect(
        screen.getByText(/Your wallet is on PUBLIC, but this contract is on TESTNET/i)
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText(/I understand this contract is on a different network/i)
      ).toBeInTheDocument()
    })
  })

  it('detects network mismatch after connecting wallet post-mount', async () => {
    ;(window as any).freighter = {
      isConnected: vi.fn().mockResolvedValue(false),
      getPublicKey: vi.fn().mockResolvedValue('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      getNetwork: vi.fn().mockResolvedValue('PUBLIC'),
    }

    render(<NewContractPage />)

    // Initially not connected, warning is not shown
    expect(
      screen.queryByText(/Your wallet is on PUBLIC, but this contract is on TESTNET/i)
    ).not.toBeInTheDocument()

    // User connects wallet
    ;(window as any).freighter.isConnected = vi.fn().mockResolvedValue(true)
    const connectBtn = await screen.findByRole('button', { name: /Connect Freighter/i })
    fireEvent.click(connectBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Your wallet is on PUBLIC, but this contract is on TESTNET/i)
      ).toBeInTheDocument()
    })
  })

  it('clears warning when wallet disconnects', async () => {
    ;(window as any).freighter = {
      isConnected: vi.fn().mockResolvedValue(true),
      getPublicKey: vi.fn().mockResolvedValue('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      getNetwork: vi.fn().mockResolvedValue('PUBLIC'),
    }

    render(<NewContractPage />)

    await waitFor(() => {
      expect(
        screen.getByText(/Your wallet is on PUBLIC, but this contract is on TESTNET/i)
      ).toBeInTheDocument()
    })

    // Disconnect
    const disconnectBtn = screen.getByRole('button', { name: /Disconnect/i })
    fireEvent.click(disconnectBtn)

    await waitFor(() => {
      expect(
        screen.queryByText(/Your wallet is on PUBLIC, but this contract is on TESTNET/i)
      ).not.toBeInTheDocument()
      expect(
        screen.queryByLabelText(/I understand this contract is on a different network/i)
      ).not.toBeInTheDocument()
    })
  })

  it('requires acknowledgement before saving when networks mismatch', async () => {
    ;(window as any).freighter = {
      isConnected: vi.fn().mockResolvedValue(true),
      getPublicKey: vi.fn().mockResolvedValue('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      getNetwork: vi.fn().mockResolvedValue('PUBLIC'),
    }

    render(<NewContractPage />)

    const ack = await screen.findByLabelText(
      /I understand this contract is on a different network/i
    )
    expect(ack).not.toBeChecked()

    fireEvent.click(ack)
    expect(ack).toBeChecked()
  })
})

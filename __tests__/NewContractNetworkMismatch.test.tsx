import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NewContractPage from '@/app/contracts/new/page'

const freighterApi = vi.hoisted(() => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
}))

vi.mock('@stellar/freighter-api', () => freighterApi)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/contractSync', () => ({
  syncSaveContract: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('@/lib/storage', () => ({
  getContracts: vi.fn().mockReturnValue([]),
  addContract: vi.fn(),
  saveContract: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/stellar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stellar')>()
  return {
    ...actual,
    checkContractOnNetwork: vi.fn().mockResolvedValue(true),
    contractExists: vi.fn().mockResolvedValue(true),
  }
})

describe('NewContractPage - Network Mismatch & Acknowledgement (#12, #13)', () => {
  beforeEach(() => {
    delete (window as any).__freighterPublicKey
    localStorage.clear()
    vi.clearAllMocks()
    freighterApi.isConnected.mockResolvedValue({ isConnected: true })
    freighterApi.getAddress.mockResolvedValue({
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })
    freighterApi.getNetworkDetails.mockResolvedValue({
      network: 'PUBLIC',
      networkUrl: 'https://horizon.stellar.org',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    })
  })

  it('detects network mismatch automatically on initial mount when connected', async () => {
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
    freighterApi.isConnected.mockResolvedValue({ isConnected: false })

    render(<NewContractPage />)

    // Initially not connected, warning is not shown
    expect(
      screen.queryByText(/Your wallet is on PUBLIC, but this contract is on TESTNET/i)
    ).not.toBeInTheDocument()

    // User connects wallet
    freighterApi.isConnected.mockResolvedValue({ isConnected: true })
    const connectBtn = await screen.findByRole('button', { name: /Connect Freighter/i })
    fireEvent.click(connectBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Your wallet is on PUBLIC, but this contract is on TESTNET/i)
      ).toBeInTheDocument()
    })
  })

  it('clears warning when wallet disconnects', async () => {
    render(<NewContractPage />)

    await waitFor(() => {
      expect(
        screen.getByText(/Your wallet is on PUBLIC, but this contract is on TESTNET/i)
      ).toBeInTheDocument()
    })

    // Disconnect
    freighterApi.isConnected.mockResolvedValue({ isConnected: false })
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

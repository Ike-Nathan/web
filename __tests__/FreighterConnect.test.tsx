import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { getAddress, getNetworkDetails, isConnected, requestAccess } from '@stellar/freighter-api'
import FreighterConnect from '@/components/FreighterConnect'

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}))

const mockIsConnected = vi.mocked(isConnected)
const mockGetAddress = vi.mocked(getAddress)
const mockGetNetworkDetails = vi.mocked(getNetworkDetails)
const mockRequestAccess = vi.mocked(requestAccess)

const MOCK_PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const WALLET_STORAGE_KEY = 'freighter_public_key'

/** Shape of the `error` field the package returns instead of throwing. */
const EXTENSION_MISSING = { code: -1, message: 'Extension not detected' }

/** Extension installed and approved for this site. */
function mockConnectedSession(publicKey = MOCK_PUBLIC_KEY) {
  mockIsConnected.mockResolvedValue({ isConnected: true })
  mockGetAddress.mockResolvedValue({ address: publicKey })
  mockGetNetworkDetails.mockResolvedValue({
    network: 'TESTNET',
    networkUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  })
  mockRequestAccess.mockResolvedValue({ address: publicKey })
}

/** Extension installed, but the user has not connected this site yet. */
function mockDisconnectedSession() {
  mockIsConnected.mockResolvedValue({ isConnected: false })
  mockGetAddress.mockResolvedValue({ address: '' })
  mockGetNetworkDetails.mockResolvedValue({
    network: 'TESTNET',
    networkUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  })
  mockRequestAccess.mockResolvedValue({ address: MOCK_PUBLIC_KEY })
}

/** No extension: the API reports an error instead of a connection state. */
function mockExtensionMissing() {
  mockIsConnected.mockResolvedValue({ isConnected: false, error: EXTENSION_MISSING })
  mockGetAddress.mockResolvedValue({ address: '', error: EXTENSION_MISSING })
  mockGetNetworkDetails.mockResolvedValue({
    network: '',
    networkUrl: '',
    networkPassphrase: '',
    error: EXTENSION_MISSING,
  })
  mockRequestAccess.mockResolvedValue({ address: '', error: EXTENSION_MISSING })
}

describe('FreighterConnect', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockDisconnectedSession()
  })

  describe('connection states', () => {
    it('renders connect button when not connected', async () => {
      render(<FreighterConnect />)
      expect(
        await screen.findByRole('button', { name: /Connect Freighter/ })
      ).toBeInTheDocument()
    })

    it('renders connected state with public key', async () => {
      mockConnectedSession()

      render(<FreighterConnect />)

      await waitFor(() => {
        expect(screen.getByText(/GAAA\.\.\.AAAA/)).toBeInTheDocument()
      })
    })

    it('shows disconnect button when connected', async () => {
      mockConnectedSession()

      render(<FreighterConnect />)

      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
      })
    })

    it('disconnects when disconnect button is clicked', async () => {
      mockConnectedSession()

      render(<FreighterConnect />)

      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Disconnect'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Connect Freighter/ })).toBeInTheDocument()
      })
    })
  })

  describe('rejection handling', () => {
    it('shows error when user rejects connection', async () => {
      mockRequestAccess.mockRejectedValue(new Error('User rejected'))

      render(<FreighterConnect />)

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      await waitFor(() => {
        expect(screen.getByText('User rejected')).toBeInTheDocument()
      })
    })

    it('shows the API error message when the wallet returns one', async () => {
      mockRequestAccess.mockResolvedValue({
        address: '',
        error: { code: -1, message: 'User declined access' },
      })

      render(<FreighterConnect />)

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      await waitFor(() => {
        expect(screen.getByText('User declined access')).toBeInTheDocument()
      })
    })

    it('clears error when user tries again', async () => {
      mockRequestAccess
        .mockRejectedValueOnce(new Error('User rejected'))
        .mockResolvedValueOnce({ address: MOCK_PUBLIC_KEY })

      render(<FreighterConnect />)

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      await waitFor(() => {
        expect(screen.getByText('User rejected')).toBeInTheDocument()
      })

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      await waitFor(() => {
        expect(screen.queryByText('User rejected')).not.toBeInTheDocument()
      })
    })
  })

  describe('unavailable extension', () => {
    it('shows error and install link when extension is not installed', async () => {
      mockExtensionMissing()

      render(<FreighterConnect />)

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      await waitFor(() => {
        expect(screen.getByText(/Freighter not installed/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Install Freighter/i })).toHaveAttribute(
          'href',
          'https://www.freighter.app/'
        )
        expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument()
      })
    })

    it('allows retrying detection after extension is installed', async () => {
      mockExtensionMissing()

      render(<FreighterConnect />)

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument()
      })

      // Simulate extension installation
      mockConnectedSession()

      fireEvent.click(screen.getByRole('button', { name: /check again/i }))

      await waitFor(() => {
        expect(screen.getByText(/GAAA\.\.\.AAAA/)).toBeInTheDocument()
      })
    })
  })

  describe('callbacks', () => {
    it('calls onConnect callback when connection succeeds', async () => {
      const onConnect = vi.fn()
      mockDisconnectedSession()

      render(<FreighterConnect onConnect={onConnect} />)

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      await waitFor(() => {
        expect(onConnect).toHaveBeenCalledWith(MOCK_PUBLIC_KEY)
      })
    })

    it('calls onConnect callback on initial mount if already connected', async () => {
      const onConnect = vi.fn()
      mockConnectedSession()

      render(<FreighterConnect onConnect={onConnect} />)

      await waitFor(() => {
        expect(onConnect).toHaveBeenCalledWith(MOCK_PUBLIC_KEY)
      })
    })
  })

  describe('wallet state is not persisted', () => {
    it('never writes the connected public key to local storage', async () => {
      mockDisconnectedSession()
      const onConnect = vi.fn()

      render(<FreighterConnect onConnect={onConnect} />)

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
      })
      expect(onConnect).toHaveBeenCalledWith(MOCK_PUBLIC_KEY)
      expect(localStorage.getItem(WALLET_STORAGE_KEY)).toBeNull()
    })

    it('does not leave a stale key behind after disconnecting', async () => {
      mockConnectedSession()

      render(<FreighterConnect />)

      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Disconnect'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Connect Freighter/ })).toBeInTheDocument()
      })
      expect(localStorage.getItem(WALLET_STORAGE_KEY)).toBeNull()
    })
  })

  describe('loading state', () => {
    it('disables button while connecting', async () => {
      mockRequestAccess.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ address: MOCK_PUBLIC_KEY }), 100))
      )

      render(<FreighterConnect />)

      const button = await screen.findByRole('button', { name: /Connect Freighter/ })
      fireEvent.click(button)

      await waitFor(() => {
        expect(button).toBeDisabled()
      })
    })
  })

  describe('slow approval', () => {
    it('waits for a slow requestAccess instead of reporting the extension as missing', async () => {
      mockRequestAccess.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ address: MOCK_PUBLIC_KEY }), 5000)
          )
      )

      render(<FreighterConnect />)

      fireEvent.click(await screen.findByRole('button', { name: /Connect Freighter/ }))

      // While the user is still approving, no "not installed" error should appear.
      await new Promise((resolve) => setTimeout(resolve, 3000))
      expect(screen.queryByText(/Freighter not installed/)).not.toBeInTheDocument()

      await waitFor(
        () => {
          expect(screen.getByText('Disconnect')).toBeInTheDocument()
        },
        { timeout: 8000 }
      )
      expect(screen.queryByText(/Freighter not installed/)).not.toBeInTheDocument()
    }, 15000)
  })
})

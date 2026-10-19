import { vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import WebhookLog from '@/components/WebhookLog'
import { AlertPayload } from '@/types'
import { formatRelativeTime } from '@/lib/format'

const explorerTxUrl = vi.fn((network: string, hash: string) => `https://stellar.expert/explorer/${network}/tx/${hash}`)

vi.mock('@/lib/stellar', () => ({
  explorerTxUrl: (network: string, hash: string) => explorerTxUrl(network, hash),
  // WebhookLog also calls truncateId; omitting it made every render throw.
  truncateId: (id: string, chars = 8) =>
    id.length <= chars * 2 + 3 ? id : `${id.slice(0, chars)}...${id.slice(-chars)}`,
}))

const baseAlert: AlertPayload = {
  label: 'Test Contract',
  contract_id: 'C123',
  network: 'testnet',
  rule_triggered: 'LargeTransfer',
  transaction_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  timestamp: new Date('2024-01-15T12:00:00Z').getTime(),
  horizon_link: 'https://horizon-testnet.stellar.org/transactions/abcdef',
}

describe('WebhookLog', () => {
  beforeEach(() => {
    explorerTxUrl.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders empty state when there are no alerts', () => {
    render(<WebhookLog alerts={[]} network="testnet" />)
    expect(screen.getByText('No alerts yet')).toBeInTheDocument()
  })

  it('renders alert rows when alerts are provided', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    expect(screen.getByText('Large Transfer')).toBeInTheDocument()
  })

  it('renders explorer link with shortened tx hash', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    const link = screen.getByRole('link', { name: /abcdef12/ })
    expect(link).toHaveAttribute('href', expect.stringContaining(baseAlert.transaction_hash))
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('prefers the alert network over the contract network prop', () => {
    render(<WebhookLog alerts={[{ ...baseAlert, network: 'mainnet' }]} network="testnet" />)
    expect(explorerTxUrl).toHaveBeenCalledWith('mainnet', baseAlert.transaction_hash)
  })

  it('falls back to the contract network prop when alert network is invalid', () => {
    render(<WebhookLog alerts={[{ ...baseAlert, network: 'not-a-network' as AlertPayload['network'] }]} network="testnet" />)
    expect(explorerTxUrl).toHaveBeenCalledWith('testnet', baseAlert.transaction_hash)
  })

  it('renders a secondary Horizon link when horizon_link is provided', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    const horizon = screen.getByRole('link', { name: /horizon/i })
    expect(horizon).toHaveAttribute('href', baseAlert.horizon_link)
    expect(horizon).toHaveAttribute('target', '_blank')
  })

  it('does not render a Horizon link when horizon_link is missing', () => {
    render(<WebhookLog alerts={[{ ...baseAlert, horizon_link: undefined }]} network="testnet" />)
    expect(screen.queryByRole('link', { name: /horizon/i })).not.toBeInTheDocument()
  })

  it('renders timestamp', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    expect(screen.getByText(/2024|Jan|15/)).toBeInTheDocument()
  })

  it('shows N/A for missing function_name', () => {
    render(<WebhookLog alerts={[{ ...baseAlert, function_name: undefined }]} network="testnet" />)
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
  })

  it('shows function_name when present', () => {
    render(<WebhookLog alerts={[{ ...baseAlert, function_name: 'transfer' }]} network="testnet" />)
    expect(screen.getByText('transfer')).toBeInTheDocument()
  })

  it('shows N/A for missing amount', () => {
    render(<WebhookLog alerts={[{ ...baseAlert, amount: undefined }]} network="testnet" />)
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1)
  })

  it('shows formatted amount when present', () => {
    render(<WebhookLog alerts={[{ ...baseAlert, amount: 100 }]} network="testnet" />)
    expect(screen.getByText('100.0000000 XLM')).toBeInTheDocument()
    expect(screen.queryByText(/XLM XLM/)).not.toBeInTheDocument()
  })

  it('shows export CSV button', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })

  it('renders a copy button for the transaction hash', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    const copyBtn = screen.getByTitle('Copy to clipboard')
    expect(copyBtn).toBeInTheDocument()
  })

  it('opens the alert detail drawer when a row is clicked', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    fireEvent.click(screen.getByText('Large Transfer'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Test Contract/)).toBeInTheDocument()
  })

  it('shows the full payload JSON in the drawer', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    fireEvent.click(screen.getByText('Large Transfer'))
    expect(screen.getByText(/horizon_link/)).toBeInTheDocument()
    expect(screen.getByText(/rule_triggered/)).toBeInTheDocument()
  })

  it('renders Copy JSON and Open in explorer actions in the drawer', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    fireEvent.click(screen.getByText('Large Transfer'))
    expect(screen.getByText('Copy JSON')).toBeInTheDocument()
    expect(screen.getByText('Open in explorer')).toBeInTheDocument()
  })

  it('closes the drawer when Escape is pressed', () => {
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    fireEvent.click(screen.getByText('Large Transfer'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('refreshes relative labels when the shared clock advances', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:05:00Z'))
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)

    const initialLabel = formatRelativeTime(baseAlert.timestamp)
    expect(screen.getByText(initialLabel)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000)
    })

    const updatedLabel = formatRelativeTime(baseAlert.timestamp)
    expect(updatedLabel).not.toBe(initialLabel)
    expect(screen.getByText(updatedLabel)).toBeInTheDocument()
  })

  it('does not create a per-component interval', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    render(<WebhookLog alerts={[baseAlert]} network="testnet" />)
    expect(setIntervalSpy).not.toHaveBeenCalled()
    setIntervalSpy.mockRestore()
  })

  describe('desktop table pagination (issue #230)', () => {
    it('renders pageAlerts and navigates between pages', () => {
      const manyAlerts: AlertPayload[] = Array.from({ length: 30 }, (_, i) => ({
        ...baseAlert,
        transaction_hash: `hash_${String(i).padStart(3, '0')}`,
        timestamp: baseAlert.timestamp + i * 1000,
      }))

      render(<WebhookLog alerts={manyAlerts} network="testnet" />)

      // Page 1 displays 25 rows
      expect(screen.getByText('1–25 of 30')).toBeInTheDocument()
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()

      // Click Next
      const nextBtn = screen.getByRole('button', { name: /next page/i })
      fireEvent.click(nextBtn)

      // Page 2 displays 5 rows
      expect(screen.getByText('26–30 of 30')).toBeInTheDocument()
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    })
  })

  describe('alert CSV export (issue #232)', () => {
    it('calls buildCSV with headers and rows separately and includes contract label and network in filename', async () => {
      const { exportCSV } = await import('@/components/WebhookLog')
      const createObjectURLMock = vi.fn(() => 'blob:mock-url')
      const revokeObjectURLMock = vi.fn()
      globalThis.URL.createObjectURL = createObjectURLMock
      globalThis.URL.revokeObjectURL = revokeObjectURLMock

      const clickMock = vi.fn()
      const originalCreateElement = document.createElement.bind(document)
      let downloadedFilename = ''
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'a') {
          Object.defineProperty(el, 'click', { value: clickMock })
          Object.defineProperty(el, 'download', {
            set(val) {
              downloadedFilename = val
            },
            get() {
              return downloadedFilename
            },
          })
        }
        return el
      })

      vi.useFakeTimers()
      exportCSV([baseAlert], 'My Contract', 'testnet')

      expect(createObjectURLMock).toHaveBeenCalled()
      expect(clickMock).toHaveBeenCalled()
      expect(downloadedFilename).toBe('alerts-my_contract-testnet.csv')

      // revokeObjectURL should be scheduled in setTimeout
      expect(revokeObjectURLMock).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url')
    })
  })
})


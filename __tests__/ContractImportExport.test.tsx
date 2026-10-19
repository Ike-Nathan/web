import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ContractImportExport from '@/components/ContractImportExport'
import { getContracts } from '@/lib/storage'

const CID = 'C' + 'A'.repeat(55)
const entry = (over = {}) => ({
  id: 'i1', label: 'A', contract_id: CID, network: 'testnet',
  rules: [{ type: 'AnyTransaction' }], webhook_url: 'https://e.com/h',
  created_at: 1, updated_at: 1, ...over,
})

function upload(json: string) {
  const file = new File([json], 'x.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) })
  fireEvent.change(screen.getByLabelText('Import contracts'), { target: { files: [file] } })
}

beforeEach(() => {
  localStorage.clear()
  jest.resetModules()
})

describe('ContractImportExport', () => {
  it('previews and imports valid entries, listing invalid ones', async () => {
    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry(), { bad: true }] }))
    expect(await screen.findByTestId('import-preview')).toHaveTextContent('1 valid, 1 invalid')
    fireEvent.click(screen.getByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))
  })

  it('shows an error for malformed files', async () => {
    render(<ContractImportExport />)
    upload('{')
    expect(await screen.findByRole('status')).toHaveTextContent('Invalid JSON')
  })

  it('imports a v1 contracts-only file', async () => {
    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry()] }))
    expect(await screen.findByTestId('import-preview')).toHaveTextContent('1 valid')
    fireEvent.click(screen.getByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))
  })

  it('imports a v2 full-backup file including alerts and settings', async () => {
    render(<ContractImportExport />)
    upload(
      JSON.stringify({
        version: 2,
        contracts: [entry()],
        alerts: [{ id: 'a1', contract_id: CID, network: 'testnet', type: 'AnyTransaction', created_at: 1 }],
        settings: { retentionDays: 30, notifications: true, view: 'list' },
      }),
    )
    expect(await screen.findByTestId('import-preview')).toHaveTextContent('1 valid')
    fireEvent.click(screen.getByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))
    const alerts = JSON.parse(localStorage.getItem('txwatch:alerts') || '[]')
    expect(alerts).toHaveLength(1)
    const settings = JSON.parse(localStorage.getItem('txwatch:settings') || '{}')
    expect(settings.retentionDays).toBe(30)
  })

  it('exports everything as a v2 backup when "everything" is selected', async () => {
    const createObjectURL = jest.fn(() => 'blob:mock')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true })

    let capturedBlob: Blob | undefined
    createObjectURL.mockImplementation((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock'
    })
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry()] }))
    fireEvent.click(await screen.findByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))

    fireEvent.click(screen.getByLabelText('Export everything'))
    fireEvent.click(screen.getByText('Export'))

    await waitFor(() => expect(capturedBlob).toBeDefined())
    const parsed = JSON.parse(await capturedBlob!.text())
    expect(parsed.version).toBe(2)
    expect(parsed.contracts).toHaveLength(1)
    expect(parsed).toHaveProperty('alerts')
    expect(parsed).toHaveProperty('settings')

    clickSpy.mockRestore()
  })

  it('exports contracts only when "contracts only" is selected', async () => {
    const createObjectURL = jest.fn(() => 'blob:mock')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true })

    let capturedBlob: Blob | undefined
    createObjectURL.mockImplementation((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock'
    })
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry()] }))
    fireEvent.click(await screen.findByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))

    fireEvent.click(screen.getByLabelText('Export contracts only'))
    fireEvent.click(screen.getByText('Export'))

    await waitFor(() => expect(capturedBlob).toBeDefined())
    const parsed = JSON.parse(await capturedBlob!.text())
    expect(parsed.version).toBe(1)
    expect(parsed.contracts).toHaveLength(1)
    expect(parsed).not.toHaveProperty('alerts')

    clickSpy.mockRestore()
  })

  it('requires confirmation for replace mode and lists affected contracts', async () => {
    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry()] }))
    fireEvent.click(await screen.findByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))

    upload(JSON.stringify({ version: 1, contracts: [entry({ id: 'i2', label: 'B' })] }))
    await screen.findByTestId('import-preview')
    fireEvent.click(screen.getByLabelText('Replace all existing'))
    fireEvent.click(screen.getByText('Apply import'))

    const confirm = await screen.findByTestId('replace-confirm')
    expect(confirm).toHaveTextContent('A')
    expect(confirm).toHaveTextContent('B')

    fireEvent.click(screen.getByText('Confirm replace'))
    await waitFor(() => {
      const contracts = getContracts()
      expect(contracts).toHaveLength(1)
      expect(contracts[0].label).toBe('B')
    })
  })

  it('resets the file input after reading so the same file can be re-selected', async () => {
    render(<ContractImportExport />)
    const input = screen.getByLabelText('Import contracts') as HTMLInputElement
    upload('{')
    await screen.findByRole('status')
    expect(input.value).toBe('')
  })

  it('rejects files over 5 MB', async () => {
    render(<ContractImportExport />)
    const big = 'x'.repeat(5 * 1024 * 1024 + 1)
    const file = new File([big], 'big.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(big) })
    fireEvent.change(screen.getByLabelText('Import contracts'), { target: { files: [file] } })
    expect(await screen.findByRole('status')).toHaveTextContent(/too large|5 MB/i)
  })

  it('moves focus to the preview when it appears', async () => {
    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry()] }))
    const preview = await screen.findByTestId('import-preview')
    await waitFor(() => expect(document.activeElement).toBe(preview))
  })

  it('uses syncSaveContract in API mode and reports per-entry sync failures', async () => {
    jest.doMock('@/lib/sync', () => ({
      syncSaveContract: jest.fn(async (c: any) => {
        if (c.label === 'B') throw new Error('boom')
      }),
      syncDeleteContract: jest.fn(async () => {}),
    }))
    const { default: Component } = await import('@/components/ContractImportExport')
    render(<Component />)
    upload(
      JSON.stringify({
        version: 1,
        contracts: [entry(), entry({ id: 'i2', label: 'B' })],
      }),
    )
    await screen.findByTestId('import-preview')
    fireEvent.click(screen.getByText('Apply import'))
    expect(await screen.findByRole('status')).toHaveTextContent(/B/)
    expect(await screen.findByRole('status')).toHaveTextContent(/boom|failed/i)
  })

  it('uses syncDeleteContract in replace mode in API mode', async () => {
    const syncDeleteContract = jest.fn(async () => {})
    jest.doMock('@/lib/sync', () => ({
      syncSaveContract: jest.fn(async () => {}),
      syncDeleteContract,
    }))
    const { default: Component } = await import('@/components/ContractImportExport')
    render(<Component />)
    upload(JSON.stringify({ version: 1, contracts: [entry()] }))
    fireEvent.click(await screen.findByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))

    upload(JSON.stringify({ version: 1, contracts: [entry({ id: 'i2', label: 'B' })] }))
    await screen.findByTestId('import-preview')
    fireEvent.click(screen.getByLabelText('Replace all existing'))
    fireEvent.click(screen.getByText('Apply import'))
    fireEvent.click(await screen.findByText('Confirm replace'))
    await waitFor(() => expect(syncDeleteContract).toHaveBeenCalled())
  })

  it('preserves webhook_secret through import', async () => {
    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry({ webhook_secret: 'whsec_abc123' })] }))
    expect(await screen.findByTestId('import-preview')).toHaveTextContent('1 valid')
    fireEvent.click(screen.getByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))
    expect(getContracts()[0].webhook_secret).toBe('whsec_abc123')
  })

  it('excludes webhook_secret from CSV exports', async () => {
    const createObjectURL = jest.fn(() => 'blob:mock')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true })

    let capturedBlob: Blob | undefined
    createObjectURL.mockImplementation((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock'
    })
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry({ webhook_secret: 'whsec_abc123' })] }))
    fireEvent.click(await screen.findByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))

    fireEvent.click(screen.getByLabelText('Export contracts only'))
    fireEvent.click(screen.getByText('Export'))

    await waitFor(() => expect(capturedBlob).toBeDefined())
    const text = await capturedBlob!.text()
    expect(text).not.toContain('whsec_abc123')
    expect(text).not.toContain('webhook_secret')

    clickSpy.mockRestore()
  })

  it('re-keys alerts instead of deleting them when a replaced contract matches by (contract_id, network)', async () => {
    localStorage.setItem(
      'txwatch:alerts',
      JSON.stringify([
        { id: 'a1', contract_id: CID, network: 'testnet', type: 'AnyTransaction', created_at: 1 },
      ]),
    )
    render(<ContractImportExport />)
    upload(JSON.stringify({ version: 1, contracts: [entry()] }))
    fireEvent.click(await screen.findByText('Apply import'))
    await waitFor(() => expect(getContracts()).toHaveLength(1))

    upload(JSON.stringify({ version: 1, contracts: [entry({ id: 'i2', label: 'B' })] }))
    await screen.findByTestId('import-preview')
    fireEvent.click(screen.getByLabelText('Replace all existing'))
    fireEvent.click(screen.getByText('Apply import'))
    fireEvent.click(await screen.findByText('Confirm replace'))

    await waitFor(() => {
      const alerts = JSON.parse(localStorage.getItem('txwatch:alerts') || '[]')
      expect(alerts).toHaveLength(1)
      expect(alerts[0].contract_id).toBe(CID)
      expect(alerts[0].network).toBe('testnet')
    })
  })
})
import { vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ContractVerification, { type VerificationStatus } from '@/components/ContractVerification'

global.fetch = vi.fn()

const CONTRACT_ID = `C${'A'.repeat(55)}`
const fetchMock = () => global.fetch as unknown as ReturnType<typeof vi.fn>

function mockRpc(body: unknown) {
  fetchMock().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  })
}

describe('ContractVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays hidden until the contract ID is well-formed', () => {
    render(<ContractVerification network="testnet" contractId="C123" />)
    expect(screen.queryByText(/Checking deployment/)).not.toBeInTheDocument()
  })

  it('shows a loading indicator while the RPC request is in flight', async () => {
    // Never settles, so the checking state stays on screen.
    fetchMock().mockReturnValue(new Promise(() => {}))

    render(<ContractVerification network="testnet" contractId={CONTRACT_ID} />)
    await vi.advanceTimersByTimeAsync(600)

    expect(screen.getByText('Checking deployment on testnet…')).toBeInTheDocument()
  })

  it('confirms a contract that exists on the network', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, result: { entries: [{}] } })

    render(<ContractVerification network="testnet" contractId={CONTRACT_ID} />)
    await vi.advanceTimersByTimeAsync(600)

    await waitFor(() => expect(screen.getByText('Contract found on testnet.')).toBeInTheDocument())
  })

  it('warns with an override when the contract is not on the network', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, result: { entries: [] } })
    const onStatusChange = vi.fn()
    const onOverrideChange = vi.fn()

    render(
      <ContractVerification
        network="mainnet"
        contractId={CONTRACT_ID}
        overridden={false}
        onOverrideChange={onOverrideChange}
        onStatusChange={onStatusChange}
      />
    )
    await vi.advanceTimersByTimeAsync(600)

    await waitFor(() =>
      expect(screen.getByText(/Contract not found on mainnet/)).toBeInTheDocument()
    )
    expect(onStatusChange).toHaveBeenLastCalledWith('not_found')

    const override = screen.getByRole('checkbox')
    expect(override).not.toBeChecked()
    fireEvent.click(override)
    expect(onOverrideChange).toHaveBeenCalledWith(true)
  })

  it('reflects the lifted override state on the checkbox', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, result: { entries: [] } })
    const onOverrideChange = vi.fn()

    render(
      <ContractVerification
        network="mainnet"
        contractId={CONTRACT_ID}
        overridden
        onOverrideChange={onOverrideChange}
      />
    )
    await vi.advanceTimersByTimeAsync(600)

    await waitFor(() =>
      expect(screen.getByText(/Contract not found on mainnet/)).toBeInTheDocument()
    )

    const override = screen.getByRole('checkbox')
    expect(override).toBeChecked()
    fireEvent.click(override)
    expect(onOverrideChange).toHaveBeenCalledWith(false)
  })

  it('reports the found status through onStatusChange', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, result: { entries: [{}] } })
    const onStatusChange = vi.fn<(status: VerificationStatus) => void>()

    render(
      <ContractVerification
        network="testnet"
        contractId={CONTRACT_ID}
        onStatusChange={onStatusChange}
      />
    )
    await vi.advanceTimersByTimeAsync(600)

    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith('found'))
  })

  it('does not block the form when the RPC is unreachable', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, error: { message: 'server error' } })
    const onStatusChange = vi.fn()

    render(
      <ContractVerification
        network="testnet"
        contractId={CONTRACT_ID}
        onStatusChange={onStatusChange}
      />
    )
    await vi.advanceTimersByTimeAsync(600)

    await waitFor(() =>
      expect(screen.getByText(/Could not verify the deployment on testnet/)).toBeInTheDocument()
    )
    expect(screen.getByText(/Saving is not blocked/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(onStatusChange).toHaveBeenLastCalledWith('error')
  })

  it('re-checks when the network changes', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, result: { entries: [{}] } })
    const { rerender } = render(<ContractVerification network="testnet" contractId={CONTRACT_ID} />)
    await vi.advanceTimersByTimeAsync(600)
    await waitFor(() => expect(screen.getByText('Contract found on testnet.')).toBeInTheDocument())

    mockRpc({ jsonrpc: '2.0', id: 1, result: { entries: [] } })
    rerender(<ContractVerification network="futurenet" contractId={CONTRACT_ID} />)
    await vi.advanceTimersByTimeAsync(600)

    await waitFor(() =>
      expect(screen.getByText(/Contract not found on futurenet/)).toBeInTheDocument()
    )
  })
})

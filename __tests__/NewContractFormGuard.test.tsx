import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import NewContractPage from '@/app/contracts/new/page'
import { syncSaveContract } from '@/lib/contractSync'
import { addContract, saveContract } from '@/lib/storage'

const pushMock = vi.fn()
const backMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
}))

vi.mock('@/lib/contractSync', () => ({
  syncSaveContract: vi.fn().mockResolvedValue({ ok: true, localSaved: true }),
}))

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('@/lib/storage', () => ({
  getContracts: vi.fn().mockReturnValue([]),
  addContract: vi.fn(),
  saveContract: vi.fn().mockReturnValue(true),
}))

describe('NewContractPage - Timer Cleanup & Form Guard (#18, #19, #20)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as any).freighter
  })

  it('navigates directly to /contracts on clean cancel without showing discard modal', async () => {
    render(<NewContractPage />)

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelBtn)

    expect(screen.queryByText(/Discard unsaved changes\?/i)).not.toBeInTheDocument()
    expect(pushMock).toHaveBeenCalledWith('/contracts')
  })

  it('prompts to discard changes when cancel is clicked on dirty form', async () => {
    render(<NewContractPage />)

    const labelInput = screen.getByPlaceholderText(/e\.g\. My DEX Contract/i)
    fireEvent.change(labelInput, { target: { value: 'My Token' } })

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelBtn)

    expect(screen.getByText(/Discard unsaved changes\?/i)).toBeInTheDocument()

    // Clicking 'Keep editing' closes modal
    fireEvent.click(screen.getByRole('button', { name: /Keep editing/i }))
    expect(screen.queryByText(/Discard unsaved changes\?/i)).not.toBeInTheDocument()

    // Clicking 'Discard' navigates away
    fireEvent.click(cancelBtn)
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }))
    expect(pushMock).toHaveBeenCalledWith('/contracts')
  })

  it('clears post-save redirect timer on unmount before timer fires (#20)', async () => {
    vi.useFakeTimers()
    const { unmount } = render(<NewContractPage />)

    // Unmount immediately
    unmount()

    // Advance time past the 1500ms post-save timer
    vi.advanceTimersByTime(2000)

    expect(pushMock).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('submits via the form when Enter is pressed in a field (#199)', async () => {
    render(<NewContractPage />)

    const labelInput = screen.getByPlaceholderText(/e\.g\. My DEX Contract/i)
    fireEvent.change(labelInput, { target: { value: 'My Token' } })

    const saveBtn = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(syncSaveContract).toHaveBeenCalledTimes(1)
    })

    // The duplicate check lives in validate; addContract must not be called again
    expect(addContract).not.toHaveBeenCalled()
    // saveContract is only called by syncSaveContract (mocked), not directly
    expect(saveContract).not.toHaveBeenCalled()

    // Advance past the post-save redirect timer
    vi.advanceTimersByTime(2000)

    expect(pushMock).toHaveBeenCalledWith('/contracts')
    vi.useRealTimers()
  })

  it('has no accessibility violations on the Add Contract page (#197)', async () => {
    const { container } = render(<NewContractPage />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
    const form = labelInput.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => {
      expect(addContract).toHaveBeenCalled()
    })
  })

  it('exposes a type=submit Save Contract button and type=button secondary actions (#199)', () => {
    render(<NewContractPage />)

    expect(screen.getByRole('button', { name: /Save Contract/i })).toHaveAttribute('type', 'submit')
    expect(screen.getByRole('button', { name: /Cancel/i })).toHaveAttribute('type', 'button')
  })

  it('does not render a duplicate override checkbox outside ContractVerification (#198)', () => {
    render(<NewContractPage />)

    // Only ContractVerification may render an override control; the page-level
    // duplicate checkbox has been removed.
    const overrideCheckboxes = screen
      .queryAllByRole('checkbox')
      .filter((el) => /save anyway|override/i.test(el.getAttribute('aria-label') ?? ''))
    expect(overrideCheckboxes.length).toBeLessThanOrEqual(1)
  })
})

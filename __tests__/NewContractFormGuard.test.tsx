import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NewContractPage from '@/app/contracts/new/page'

const pushMock = vi.fn()
const backMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
}))

vi.mock('@/lib/contractSync', () => ({
  syncSaveContract: vi.fn().mockResolvedValue(true),
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
})

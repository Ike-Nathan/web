import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ContractCard from '../components/ContractCard'
import { WatchedContract } from '@/types'

const mockContract: WatchedContract = {
  id: 'test-contract-1',
  label: 'Test Escrow Contract',
  contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7',
  network: 'testnet',
  rules: [
    { type: 'AnyTransaction' },
  ],
  webhook_url: 'https://example.com/webhook',
  created_at: 1700000000000,
  updated_at: 1700000000000,
  enabled: true,
}

describe('ContractCard Accessibility in Selection Mode (Issue #217)', () => {
  it('renders a label element instead of a div role="button" when selectable', () => {
    const onToggleSelect = jest.fn()
    const { container } = render(
      <ContractCard
        contract={mockContract}
        selectable={true}
        selected={false}
        onToggleSelect={onToggleSelect}
      />
    )

    // Ensure there is no div with role="button" nesting the checkbox
    expect(screen.queryByRole('button', { name: /select/i })).not.toBeInTheDocument()
    expect(container.querySelector('[role="button"]')).toBeNull()

    // The root element must be a <label>
    const label = container.querySelector('label')
    expect(label).toBeInTheDocument()
    expect(label).toHaveAttribute('id', 'contract-test-contract-1')

    // The checkbox must be present and accessible
    const checkbox = screen.getByRole('checkbox', {
      name: `Select ${mockContract.label}`,
    })
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()

    // Clicking the checkbox calls onToggleSelect
    fireEvent.click(checkbox)
    expect(onToggleSelect).toHaveBeenCalledWith(mockContract.id)
  })

  it('toggles selection when clicking the label', () => {
    const onToggleSelect = jest.fn()
    const { container } = render(
      <ContractCard
        contract={mockContract}
        selectionMode={true}
        selected={false}
        onToggleSelected={onToggleSelect}
      />
    )

    const checkbox = screen.getByRole('checkbox', {
      name: `Select ${mockContract.label}`,
    })
    expect(checkbox).not.toBeChecked()

    // Trigger change via checkbox (label clicks forward to input)
    fireEvent.change(checkbox, { target: { checked: true } })
    expect(onToggleSelect).toHaveBeenCalledWith(mockContract.id)
  })

  it('renders a link when not in selection mode', () => {
    const { container } = render(
      <ContractCard
        contract={mockContract}
        selectable={false}
      />
    )

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', `/contracts/${mockContract.id}`)
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
  })
})

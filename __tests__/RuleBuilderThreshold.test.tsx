import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import RuleBuilder from '../components/RuleBuilder'

function addLargeTransfer(threshold: string) {
  const onChange = vi.fn()
  render(<RuleBuilder rules={[]} onChange={onChange} />)
  fireEvent.change(screen.getByLabelText(/rule type/i), {
    target: { value: 'LargeTransfer' },
  })
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. 10000/i), {
    target: { value: threshold },
  })
  fireEvent.click(screen.getByRole('button', { name: /add rule/i }))
  return onChange
}

describe('RuleBuilder LargeTransfer threshold validation', () => {
  it('rejects 0.00000001 (8 decimals, which String() prints as 1e-8)', () => {
    const onChange = addLargeTransfer('0.00000001')
    expect(
      screen.getByText(/supports at most 7 decimal places/i)
    ).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects exponent notation such as 1e-7', () => {
    const onChange = addLargeTransfer('1e-7')
    expect(screen.getByText(/plain decimal number/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects 50000000000.0000001 (above the supply, though equal as a float)', () => {
    const onChange = addLargeTransfer('50000000000.0000001')
    expect(screen.getByText(/cannot exceed 50,000,000,000 XLM/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts the smallest unit, 0.0000001', () => {
    const onChange = addLargeTransfer('0.0000001')
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'LargeTransfer', threshold_xlm: 1e-7 }),
    ])
  })
})

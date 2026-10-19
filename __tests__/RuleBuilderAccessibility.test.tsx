import { fireEvent, render, screen } from '@testing-library/react'
import RuleBuilder from '../components/RuleBuilder'

vi.mock('../components/AlertRuleBadge', () => ({ default: () => null }))

describe('RuleBuilder accessibility', () => {
  it('announces validation errors and focuses the invalid field', () => {
    render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/rule type/i), {
      target: { value: 'LargeTransfer' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add rule/i }))

    const error = screen.getByText(/enter a valid xlm threshold/i)
    expect(error.parentElement).toHaveAttribute('aria-live', 'polite')
    const threshold = screen.getByLabelText(/threshold \(xlm\)/i)
    expect(threshold).toHaveFocus()
    expect(threshold).toHaveAttribute('aria-invalid', 'true')
    expect(threshold).toHaveAttribute('aria-describedby')
    const describedBy = threshold.getAttribute('aria-describedby') as string
    expect(describedBy.split(' ')).toContain(error.id)
  })

  it('associates labels with their inputs via htmlFor and id', () => {
    render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

    const typeInput = screen.getByLabelText(/rule type/i)
    expect(typeInput).toHaveAttribute('id')

    const label = screen.getByText(/rule type/i)
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', typeInput.getAttribute('id'))

    fireEvent.change(typeInput, { target: { value: 'LargeTransfer' } })

    const threshold = screen.getByLabelText(/threshold \(xlm\)/i)
    expect(threshold).toHaveAttribute('id')
    expect(threshold).not.toHaveAttribute('aria-invalid', 'true')

    const thresholdLabel = screen.getByText(/threshold \(xlm\)/i)
    expect(thresholdLabel.tagName).toBe('LABEL')
    expect(thresholdLabel).toHaveAttribute('for', threshold.getAttribute('id'))
  })

  it('announces duplicate-rule warnings', () => {
    render(
      <RuleBuilder rules={[{ type: 'AnyTransaction' }]} onChange={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: /add rule/i }))

    const warning = screen.getByText(/this rule already exists/i)
    expect(warning.parentElement).toHaveAttribute('aria-live', 'polite')
  })

  it('supports preset menu navigation, Escape, and focus return', () => {
    render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /presets/i })
    fireEvent.click(trigger)

    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()

    fireEvent.keyDown(items[0], { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(items[1], { key: 'ArrowUp' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0], { key: 'End' })
    expect(items[items.length - 1]).toHaveFocus()
    fireEvent.keyDown(items[items.length - 1], { key: 'Home' })
    expect(items[0]).toHaveFocus()

    fireEvent.keyDown(items[0], { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes the preset menu on outside click', () => {
    render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /presets/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('returns focus to the trigger after applying a preset', () => {
    const onChange = vi.fn()
    render(<RuleBuilder rules={[]} onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: /presets/i })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /token transfers/i }))

    expect(onChange).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

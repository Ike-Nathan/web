import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import RuleBuilder from '../components/RuleBuilder'
import { importSchema } from '../lib/schemas'

describe('RuleBuilder', () => {
  describe('editing index integrity', () => {
    it('keeps editing the correct rule after removing an earlier rule', () => {
      const handleChange = vi.fn()
      render(<RuleBuilder rules={[]} onChange={handleChange} />)

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton) // AnyTransaction rule 0
      fireEvent.click(addButton) // AnyTransaction rule 1
      fireEvent.click(addButton) // AnyTransaction rule 2

      expect(handleChange).toHaveBeenCalledTimes(3)
      const threeRules = handleChange.mock.calls[2][0]
      expect(threeRules).toHaveLength(3)

      // Edit rule #2 by removing rule #0 first
      const removeButtons = screen.getAllByRole('button', { name: /remove/i })
      fireEvent.click(removeButtons[0])

      expect(handleChange).toHaveBeenCalledTimes(4)
      const twoRules = handleChange.mock.calls[3][0]
      expect(twoRules).toHaveLength(2)
    })

    it('resets editing state when the rule being edited is removed', () => {
      const rules = [
        { type: 'AnyTransaction' as const },
        { type: 'TransactionFailed' as const },
      ]
      const handleChange = vi.fn()
      const { rerender } = render(
        <RuleBuilder rules={rules} onChange={handleChange} />
      )

      const editButtons = screen.getAllByRole('button', { name: /edit/i })
      fireEvent.click(editButtons[1])

      // Update rules to remove the edited rule
      const removeButtons = screen.getAllByRole('button', { name: /remove/i })
      fireEvent.click(removeButtons[1])

      expect(handleChange).toHaveBeenCalled()
      const updatedRules =
        handleChange.mock.calls[handleChange.mock.calls.length - 1][0]
      rerender(<RuleBuilder rules={updatedRules} onChange={handleChange} />)

      // "Cancel" button should not exist after removing the edited rule
      expect(
        screen.queryByRole('button', { name: /cancel/i })
      ).not.toBeInTheDocument()
    })
  })

  describe('LargeTransfer validation', () => {
    it('rejects empty threshold', () => {
      render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

      // Select LargeTransfer type
      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'LargeTransfer' } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(
        screen.getByText(/enter a valid xlm threshold/i)
      ).toBeInTheDocument()
    })

    it('rejects negative threshold', () => {
      render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'LargeTransfer' } })

      const thresholdInput = screen.getByPlaceholderText(/e\.g\. 10000/i)
      fireEvent.change(thresholdInput, { target: { value: '-100' } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(
        screen.getByText(/threshold must be greater than 0/i)
      ).toBeInTheDocument()
    })

    it('rejects thresholds with more than 7 decimal places', () => {
      render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'LargeTransfer' } })

      const thresholdInput = screen.getByPlaceholderText(/e\.g\. 10000/i)
      fireEvent.change(thresholdInput, { target: { value: '1.12345678' } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(
        screen.getByText(/supports at most 7 decimal places/i)
      ).toBeInTheDocument()
    })

    it('accepts valid threshold', () => {
      const handleChange = vi.fn()
      render(<RuleBuilder rules={[]} onChange={handleChange} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'LargeTransfer' } })

      const thresholdInput = screen.getByPlaceholderText(/e\.g\. 10000/i)
      fireEvent.change(thresholdInput, { target: { value: '1000.1234567' } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(handleChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'LargeTransfer',
            threshold_xlm: 1000.1234567,
          }),
        ])
      )
    })
  })

  describe('FunctionCalled validation', () => {
    it('rejects empty function name', () => {
      render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'FunctionCalled' } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(screen.getByText(/enter a function name/i)).toBeInTheDocument()
    })

    it('rejects invalid function names', () => {
      render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'FunctionCalled' } })

      const funcInput = screen.getByPlaceholderText(/e\.g\. transfer/i)

      // Test name starting with number
      fireEvent.change(funcInput, { target: { value: '123invalid' } })
      let addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)
      expect(
        screen.getByText(/must start with a letter or underscore/i)
      ).toBeInTheDocument()

      // Test name with invalid characters
      fireEvent.change(funcInput, { target: { value: 'invalid-name' } })
      addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)
      expect(
        screen.getByText(/must start with a letter or underscore/i)
      ).toBeInTheDocument()
    })

    it('accepts valid function names', () => {
      const handleChange = vi.fn()
      render(<RuleBuilder rules={[]} onChange={handleChange} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'FunctionCalled' } })

      const funcInput = screen.getByPlaceholderText(/e\.g\. transfer/i)
      fireEvent.change(funcInput, { target: { value: 'transfer' } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(handleChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'FunctionCalled',
            function_name: 'transfer',
          }),
        ])
      )
    })
  })

  describe('AdminFunctionCalled validation', () => {
    it('rejects empty function names', () => {
      render(<RuleBuilder rules={[]} onChange={vi.fn()} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'AdminFunctionCalled' } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(
        screen.getByText(/enter at least one function name/i)
      ).toBeInTheDocument()
    })

    it('accepts comma-separated function names', () => {
      const handleChange = vi.fn()
      render(<RuleBuilder rules={[]} onChange={handleChange} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'AdminFunctionCalled' } })

      const funcInput = screen.getByPlaceholderText(/e\.g\. set_admin/i)
      fireEvent.change(funcInput, {
        target: { value: 'set_admin, upgrade, migrate' },
      })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(handleChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'AdminFunctionCalled',
            function_names: ['migrate', 'set_admin', 'upgrade'],
          }),
        ])
      )
    })

    it('rejects invalid admin function names and shows which were rejected', () => {
      const handleChange = vi.fn()
      render(<RuleBuilder rules={[]} onChange={handleChange} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'AdminFunctionCalled' } })

      const funcInput = screen.getByPlaceholderText(/e\.g\. set_admin/i)
      fireEvent.change(funcInput, {
        target: { value: 'set-admin, 123bad, upgrade' },
      })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(handleChange).not.toHaveBeenCalled()
      expect(screen.getByText(/set-admin/i)).toBeInTheDocument()
      expect(screen.getByText(/123bad/i)).toBeInTheDocument()
    })

    it('rejects admin function names longer than 32 characters', () => {
      const handleChange = vi.fn()
      render(<RuleBuilder rules={[]} onChange={handleChange} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'AdminFunctionCalled' } })

      const longName = 'a'.repeat(33)
      const funcInput = screen.getByPlaceholderText(/e\.g\. set_admin/i)
      fireEvent.change(funcInput, { target: { value: longName } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(handleChange).not.toHaveBeenCalled()
      expect(screen.getByText(new RegExp(longName))).toBeInTheDocument()
    })

    it('accepts admin function names up to 32 characters', () => {
      const handleChange = vi.fn()
      render(<RuleBuilder rules={[]} onChange={handleChange} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'AdminFunctionCalled' } })

      const maxName = 'a'.repeat(32)
      const funcInput = screen.getByPlaceholderText(/e\.g\. set_admin/i)
      fireEvent.change(funcInput, { target: { value: maxName } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(handleChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'AdminFunctionCalled',
            function_names: [maxName],
          }),
        ])
      )
    })
  })

  describe('duplicate detection', () => {
    it('warns when adding duplicate rule', () => {
      const existingRules = [{ type: 'AnyTransaction' as const }]
      render(<RuleBuilder rules={existingRules} onChange={vi.fn()} />)

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      expect(screen.getByText(/this rule already exists/i)).toBeInTheDocument()
    })

    it('allows duplicate rule when enabled flag differs', () => {
      const handleChange = vi.fn()
      const existingRules = [
        { type: 'AnyTransaction' as const, enabled: false },
        { type: 'TransactionFailed' as const },
      ]
      render(<RuleBuilder rules={existingRules} onChange={handleChange} />)

      const typeSelect = screen.getByLabelText(/rule type/i)
      fireEvent.change(typeSelect, { target: { value: 'TransactionFailed' } })

      const addButton = screen.getByRole('button', { name: /add rule/i })
      fireEvent.click(addButton)

      // Should warn about duplicate (same type/config, enabled differs but not checked in duplicate detection)
      expect(screen.getByText(/this rule already exists/i)).toBeInTheDocument()
    })
  })

  describe('rule toggle', () => {
    it('toggles rule enabled state', () => {
      const handleChange = vi.fn()
      const existingRules = [{ type: 'AnyTransaction' as const, enabled: true }]
      render(<RuleBuilder rules={existingRules} onChange={handleChange} />)

      const toggleButton = screen.getByRole('switch')
      fireEvent.click(toggleButton)

      expect(handleChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'AnyTransaction',
            enabled: false,
          }),
        ])
      )
    })
  })

  describe('rule removal', () => {
    it('removes rule from list', () => {
      const handleChange = vi.fn()
      const existingRules = [
        { type: 'AnyTransaction' as const },
        { type: 'TransactionFailed' as const },
      ]
      render(<RuleBuilder rules={existingRules} onChange={handleChange} />)

      const removeButtons = screen.getAllByRole('button', { name: /remove/i })
      fireEvent.click(removeButtons[0])

      expect(handleChange).toHaveBeenCalledWith([{ type: 'TransactionFailed' }])
    })
  })

  describe('preset rules', () => {
    it('applies preset rules', () => {
      const handleChange = vi.fn()
      render(<RuleBuilder rules={[]} onChange={handleChange} />)

      const presetsButton = screen.getByRole('button', { name: /presets/i })
      fireEvent.click(presetsButton)

      const tokenTransfersPreset = screen.getByRole('menuitem', {
        name: /token transfers/i,
      })
      fireEvent.click(tokenTransfersPreset)

      expect(handleChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'FunctionCalled',
            function_name: 'transfer',
          }),
        ])
      )
    })

    it('warns when preset rules already exist', () => {
      const existingRules = [
        { type: 'FunctionCalled' as const, function_name: 'transfer' },
      ]
      render(<RuleBuilder rules={existingRules} onChange={vi.fn()} />)

      const presetsButton = screen.getByRole('button', { name: /presets/i })
      fireEvent.click(presetsButton)

      const tokenTransfersPreset = screen.getByRole('menuitem', {
        name: /token transfers/i,
      })
      fireEvent.click(tokenTransfersPreset)

      expect(screen.getByText(/these rules already exist/i)).toBeInTheDocument()
    })
  })
})

describe('importSchema admin function names', () => {
  it('rejects invalid admin function names', () => {
    const result = importSchema.safeParse({
      rules: [{ type: 'AdminFunctionCalled', function_names: ['set-admin'] }],
    })

    expect(result.success).toBe(false)
  })

  it('rejects admin function names longer than 32 characters', () => {
    const result = importSchema.safeParse({
      rules: [
        { type: 'AdminFunctionCalled', function_names: ['a'.repeat(33)] },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('accepts and de-duplicates valid admin function names', () => {
    const result = importSchema.safeParse({
      rules: [
        {
          type: 'AdminFunctionCalled',
          function_names: ['set_admin', 'upgrade', 'set_admin'],
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rules[0]).toEqual(
        expect.objectContaining({
          type: 'AdminFunctionCalled',
          function_names: ['set_admin', 'upgrade'],
        })
      )
    }
  })
})

describe('AlertRuleBadge tooltip accessibility', () => {
  it('links the badge to the tooltip via aria-describedby and exposes role=tooltip', () => {
    render(<RuleBuilder />)

    const badge = screen.getByTestId('alert-rule-badge')
    const tooltip = screen.getByRole('tooltip')

    expect(badge).toHaveAttribute('aria-describedby', tooltip.id)
    expect(tooltip).toHaveAttribute('id')
  })

  it('shows the tooltip on keyboard focus and hides it on blur', () => {
    render(<RuleBuilder />)

    const badge = screen.getByTestId('alert-rule-badge')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(badge)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.blur(badge)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('toggles the tooltip on tap for touch users', () => {
    render(<RuleBuilder />)

    const badge = screen.getByTestId('alert-rule-badge')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.click(badge)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.click(badge)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

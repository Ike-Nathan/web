'use client'

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { AlertRule, AlertRuleType, isRuleEnabled } from '@/types'
import { formatRuleSummary } from '@/lib/format'
import { getRuleMeta } from '@/lib/ruleMeta'
import { isValidFunctionName, sanitizeAdminFunctionNames } from '@/lib/soroban'
import AlertRuleBadge from './AlertRuleBadge'

const RULE_TYPES: AlertRuleType[] = [
  'AnyTransaction',
  'LargeTransfer',
  'FunctionCalled',
  'AdminFunctionCalled',
  'TransactionFailed',
]

/** Common Soroban patterns that add one or more rules in a single click. */
export const RULE_PRESETS: { name: string; rules: AlertRule[] }[] = [
  {
    name: 'Token transfers',
    rules: [{ type: 'FunctionCalled', function_name: 'transfer' }],
  },
  {
    name: 'Mint & burn',
    rules: [
      { type: 'FunctionCalled', function_name: 'mint' },
      { type: 'FunctionCalled', function_name: 'burn' },
    ],
  },
  {
    name: 'Admin & upgrades',
    rules: [{ type: 'AdminFunctionCalled', function_names: ['set_admin', 'upgrade'] }],
  },
  {
    name: 'All failures',
    rules: [{ type: 'TransactionFailed' }],
  },
]

/** XLM supports at most 7 decimal places (stroops). */
const MAX_XLM_DECIMALS = 7
/** Total XLM supply — a reasonable upper bound for a transfer threshold. */
const MAX_XLM_THRESHOLD = 50_000_000_000

/** Returns true when the value has no more than 7 decimal places. */
function hasValidPrecision(value: number): boolean {
  if (!isFinite(value)) return false
  const decimals = (String(value).split('.')[1] ?? '').length
  return decimals <= MAX_XLM_DECIMALS
}

/** Formats a number with thousands separators, preserving up to 7 decimals. */
function formatXlm(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: MAX_XLM_DECIMALS })
}

function parseFunctionNames(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Key identifying a rule's configuration, ignoring the enabled flag. */
function ruleKey(rule: AlertRule): string {
  switch (rule.type) {
    case 'LargeTransfer':
      return `${rule.type}:${rule.threshold_xlm}`
    case 'FunctionCalled':
      return `${rule.type}:${rule.function_name.trim()}`
    case 'AdminFunctionCalled':
      return `${rule.type}:${[...rule.function_names].sort().join(',')}`
    case 'AnyTransaction':
    case 'TransactionFailed':
      return rule.type
  }
}

interface RuleBuilderProps {
  rules: AlertRule[]
  onChange: (rules: AlertRule[]) => void
  /** Optional callback fired whenever a rule is added, updated, or removed.
   *  Intended as an analytics hook point — no behavior depends on it. */
  onRulesChanged?: (rules: AlertRule[], action: 'add' | 'update' | 'remove') => void
}

export default function RuleBuilder({ rules, onChange, onRulesChanged }: RuleBuilderProps) {
  const idPrefix = useId()
  // Draft fields are held as raw text per type, so switching type never leaves stale fields.
  const [draftType, setDraftType] = useState<AlertRuleType>('AnyTransaction')
  const [thresholdText, setThresholdText] = useState('')
  const [functionName, setFunctionName] = useState('')
  const [functionNamesText, setFunctionNamesText] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [showPresets, setShowPresets] = useState(false)
  const thresholdInputRef = useRef<HTMLInputElement>(null)
  const functionNameInputRef = useRef<HTMLInputElement>(null)
  const functionNamesInputRef = useRef<HTMLInputElement>(null)
  const presetsButtonRef = useRef<HTMLButtonElement>(null)
  const presetsContainerRef = useRef<HTMLDivElement>(null)
  const presetItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const messageId = `${idPrefix}-message`
  const typeHintId = `${idPrefix}-type-hint`
  const thresholdHintId = `${idPrefix}-threshold-hint`
  const errorId = `${idPrefix}-error`
  const warningId = `${idPrefix}-warning`
  const thresholdDescribedBy = [error ? errorId : null, thresholdHintId].filter(Boolean).join(' ')
  const functionNameDescribedBy = error ? errorId : undefined
  const functionNamesDescribedBy = error ? errorId : undefined
  const typeDescribedBy = [error ? errorId : null, typeHintId].filter(Boolean).join(' ')
=======

  useEffect(() => {
    if (!showPresets) return

    presetItemRefs.current[0]?.focus()

    function handlePointerDown(event: PointerEvent) {
      if (!presetsContainerRef.current?.contains(event.target as Node)) {
        setShowPresets(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showPresets])

  function clearMessages() {
    setError(null)
    setWarning(null)
  }

  function resetDraft() {
    setDraftType('AnyTransaction')
    setThresholdText('')
    setFunctionName('')
    setFunctionNamesText('')
    clearMessages()
  }

  function handleTypeChange(type: AlertRuleType) {
    setDraftType(type)
    setThresholdText('')
    setFunctionName('')
    setFunctionNamesText('')
    clearMessages()
  }

  function isDuplicate(newRule: AlertRule, existing: AlertRule[], ignoreIndex: number | null = null): boolean {
    const key = ruleKey(newRule)
    return existing.some((rule, index) => index !== ignoreIndex && ruleKey(rule) === key)
  }

  /** Builds a rule from the draft, or sets an error and returns null. */
  function buildRule(): AlertRule | null {
    switch (draftType) {
      case 'LargeTransfer': {
        const parsed = thresholdText.trim() === '' ? NaN : parseFloat(thresholdText)
        if (isNaN(parsed)) {
          setError('Enter a valid XLM threshold')
          return null
        }
        if (parsed <= 0) {
          setError('Threshold must be greater than 0')
          return null
        }
        if (!hasValidPrecision(parsed)) {
          setError('Threshold supports at most 7 decimal places')
          return null
        }
        if (parsed > MAX_XLM_THRESHOLD) {
          setError(`Threshold cannot exceed ${formatXlm(MAX_XLM_THRESHOLD)} XLM`)
          return null
        }
        return { type: 'LargeTransfer', threshold_xlm: parsed }
      }
      case 'FunctionCalled': {
        const name = functionName.trim()
        if (!name) {
          setError('Enter a function name')
          return null
        }
        if (!isValidFunctionName(name)) {
          setError('Function name must start with a letter or underscore, contain only alphanumeric characters and underscores, and be at most 32 characters')
          return null
        }
        return { type: 'FunctionCalled', function_name: name }
      }
      case 'AdminFunctionCalled': {
        const names = parseFunctionNames(functionNamesText)
        if (!names.length) {
          setError('Enter at least one function name')
          return null
        }
        const { valid, invalid } = sanitizeAdminFunctionNames(names)
        if (invalid.length) {
          setError(`Invalid function names: ${invalid.join(', ')}`)
          return null
        }
        return { type: 'AdminFunctionCalled', function_names: [...valid].sort() }
      }
      case 'AnyTransaction':
      case 'TransactionFailed':
        return { type: draftType }
    }
  }

  function addRule() {
    const built = buildRule()
    if (!built) {
      if (draftType === 'LargeTransfer') thresholdInputRef.current?.focus()
      if (draftType === 'FunctionCalled') functionNameInputRef.current?.focus()
      if (draftType === 'AdminFunctionCalled') functionNamesInputRef.current?.focus()
      return
    }
    if (editingIndex !== null) {
      if (isDuplicate(built, rules, editingIndex)) {
        setWarning('This rule already exists')
        return
      }
      const previous = rules[editingIndex]
      const newRule: AlertRule = previous.enabled === undefined ? built : { ...built, enabled: previous.enabled }
      const updated = [...rules]
      updated[editingIndex] = newRule
      onChange(updated)
      onRulesChanged?.(updated, 'update')
      setEditingIndex(null)
    } else {
      if (isDuplicate(built, rules)) {
        setWarning('This rule already exists')
        return
      }
      const updated = [...rules, built]
      onChange(updated)
      onRulesChanged?.(updated, 'add')
    }
    resetDraft()
  }

  function applyPreset(presetRules: AlertRule[]) {
    setShowPresets(false)
    presetsButtonRef.current?.focus()
    clearMessages()
    const toAdd: AlertRule[] = []
    for (const rule of presetRules) {
      if (!isDuplicate(rule, [...rules, ...toAdd])) toAdd.push(rule)
    }
    if (!toAdd.length) {
      setWarning('These rules already exist')
      return
    }
    const updated = [...rules, ...toAdd]
    onChange(updated)
    onRulesChanged?.(updated, 'add')
  }

  function startEdit(index: number) {
    const rule = rules[index]
    setDraftType(rule.type)
    setThresholdText(rule.type === 'LargeTransfer' ? String(rule.threshold_xlm) : '')
    setFunctionName(rule.type === 'FunctionCalled' ? rule.function_name : '')
    setFunctionNamesText(rule.type === 'AdminFunctionCalled' ? rule.function_names.join(', ') : '')
    setEditingIndex(index)
    clearMessages()
  }

  function cancelEdit() {
    resetDraft()
    setEditingIndex(null)
  }

  function toggleRule(index: number) {
    const updated = rules.map((r, i) => (i === index ? { ...r, enabled: !isRuleEnabled(r) } : r))
    onChange(updated)
    onRulesChanged?.(updated, 'update')
  }

  function removeRule(index: number) {
    const updated = rules.filter((_, i) => i !== index)
    onChange(updated)
    onRulesChanged?.(updated, 'remove')
    // Keep editingIndex pointing at the same logical rule after removal.
    // Removing the edited rule itself cancels the edit to avoid a stale index.
    if (editingIndex === null) return
    if (editingIndex === index) cancelEdit()
    else if (editingIndex > index) setEditingIndex(editingIndex - 1)
  }

  function closePresetsAndReturnFocus() {
    setShowPresets(false)
    presetsButtonRef.current?.focus()
  }

  function handlePresetKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const currentIndex = presetItemRefs.current.findIndex((item) => item === document.activeElement)
    let nextIndex: number | null = null

    switch (event.key) {
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % RULE_PRESETS.length
        break
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + RULE_PRESETS.length) % RULE_PRESETS.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = RULE_PRESETS.length - 1
        break
      case 'Escape':
        event.preventDefault()
        closePresetsAndReturnFocus()
        return
      default:
        return
    }

    event.preventDefault()
    presetItemRefs.current[nextIndex]?.focus()
  }

  const thresholdPreview = parseFloat(thresholdText)

  return (
    <div className="space-y-4">
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 space-y-3">
        <div>
          <label htmlFor={`${idPrefix}-type`} className="block text-xs font-medium text-zinc-400 mb-1">Rule Type</label>
          <select
            id={`${idPrefix}-type`}
            value={draftType}
            aria-invalid={error ? true : undefined}
            aria-describedby={typeDescribedBy}
            onChange={(e) => handleTypeChange(e.target.value as AlertRuleType)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
          >
            {RULE_TYPES.map((t) => (
              <option key={t} value={t}>{getRuleMeta(t).label}</option>
            ))}
          </select>
          <p id={typeHintId} className="text-xs text-zinc-500 mt-1">{getRuleMeta(draftType).description}</p>
        </div>

        {draftType === 'LargeTransfer' && (
          <div>
            <label htmlFor={`${idPrefix}-threshold`} className="block text-xs font-medium text-zinc-400 mb-1">Threshold (XLM)</label>
            <input
              ref={thresholdInputRef}
              id={`${idPrefix}-threshold`}
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 10000"
              value={thresholdText}
              aria-invalid={error ? true : undefined}
              aria-describedby={thresholdDescribedBy}
              onChange={(e) => {
                setThresholdText(e.target.value)
                clearMessages()
              }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
            {!isNaN(thresholdPreview) && (
              <p id={thresholdHintId} className="text-xs text-zinc-500 mt-1">
                Threshold: {formatXlm(thresholdPreview)} XLM
              </p>
            )}
          </div>
        )}

        {draftType === 'FunctionCalled' && (
          <div>
            <label htmlFor={`${idPrefix}-function-name`} className="block text-xs font-medium text-zinc-400 mb-1">Function Name</label>
            <input
              ref={functionNameInputRef}
              id={`${idPrefix}-function-name`}
              type="text"
              placeholder="e.g. transfer"
              value={functionName}
              aria-invalid={error ? true : undefined}
              aria-describedby={functionNameDescribedBy}
              onChange={(e) => {
                setFunctionName(e.target.value)
                clearMessages()
              }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {draftType === 'AdminFunctionCalled' && (
          <div>
            <label htmlFor={`${idPrefix}-function-names`} className="block text-xs font-medium text-zinc-400 mb-1">
              Function Names <span className="text-zinc-600">(comma separated)</span>
            </label>
            <input
              ref={functionNamesInputRef}
              id={`${idPrefix}-function-names`}
              type="text"
              placeholder="e.g. set_admin, upgrade, migrate"
              value={functionNamesText}
              aria-invalid={error ? true : undefined}
              aria-describedby={functionNamesDescribedBy}
              onChange={(e) => {
                setFunctionNamesText(e.target.value)
                clearMessages()
              }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        <div id={messageId} aria-live="polite" aria-atomic="true">
          {error && <p id={errorId} className="text-xs text-red-400">{error}</p>}
          {warning && <p id={warningId} className="text-xs text-amber-400">{warning}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addRule}
            className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            {editingIndex !== null ? 'Save Rule' : 'Add Rule'}
          </button>
          {editingIndex !== null && (
            <button
              type="button"
              onClick={cancelEdit}
              className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <div ref={presetsContainerRef} className="relative">
            <button
              ref={presetsButtonRef}
              type="button"
              id={`${idPrefix}-presets-trigger`}
              aria-haspopup="menu"
              aria-controls={`${idPrefix}-presets-menu`}
              aria-expanded={showPresets}
              onClick={() => setShowPresets((v) => !v)}
              className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg transition-colors"
            >
              Presets
            </button>
            {showPresets && (
              <ul
                id={`${idPrefix}-presets-menu`}
                role="menu"
                aria-labelledby={`${idPrefix}-presets-trigger`}
                onKeyDown={handlePresetKeyDown}
                className="absolute left-0 mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-lg py-1 z-10"
              >
                {RULE_PRESETS.map((preset, index) => (
                  <li key={preset.name}>
                    <button
                      ref={(element) => { presetItemRefs.current[index] = element }}
                      type="button"
                      role="menuitem"
                      onClick={() => applyPreset(preset.rules)}
                      className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      {preset.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {rules.length > 0 && (
        <ul className="space-y-2">
          {rules.map((rule, index) => {
            const enabled = isRuleEnabled(rule)
            return (
              <li
                key={index}
                className={`flex items-center justify-between bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 ${enabled ? '' : 'opacity-50'}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertRuleBadge type={rule.type} />
                  <span className="text-sm text-zinc-300 truncate">{formatRuleSummary(rule)}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={enabled ? 'Disable rule' : 'Enable rule'}
                    onClick={() => toggleRule(index)}
                    className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    {enabled ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(index)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRule(index)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

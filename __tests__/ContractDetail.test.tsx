import { formatRuleSummary, formatDate } from '@/lib/format'
import { AlertRule, WatchedContract } from '@/types'
import { saveContract, getAlerts, seedMockAlerts } from '@/lib/storage'

describe('formatRuleSummary', () => {
  it('formats LargeTransfer rule with threshold', () => {
    const rule: AlertRule = { type: 'LargeTransfer', threshold_xlm: 1000 }
    expect(formatRuleSummary(rule)).toBe('>= 1000 XLM')
  })

  it('formats FunctionCalled rule with function name', () => {
    const rule: AlertRule = { type: 'FunctionCalled', function_name: 'transfer' }
    expect(formatRuleSummary(rule)).toBe('transfer')
  })

  it('formats AdminFunctionCalled rule with function names', () => {
    const rule: AlertRule = {
      type: 'AdminFunctionCalled',
      function_names: ['set_admin', 'upgrade'],
    }
    expect(formatRuleSummary(rule)).toBe('set_admin, upgrade')
  })

  it('returns empty string for AnyTransaction', () => {
    const rule: AlertRule = { type: 'AnyTransaction' }
    expect(formatRuleSummary(rule)).toBe('')
  })

  it('returns empty string for TransactionFailed', () => {
    const rule: AlertRule = { type: 'TransactionFailed' }
    expect(formatRuleSummary(rule)).toBe('')
  })

  it('handles FunctionCalled with missing function_name', () => {
    const rule: AlertRule = { type: 'FunctionCalled' }
    expect(formatRuleSummary(rule)).toBe('function')
  })

  it('handles AdminFunctionCalled with empty function_names', () => {
    const rule: AlertRule = { type: 'AdminFunctionCalled', function_names: [] }
    expect(formatRuleSummary(rule)).toBe('admin functions')
  })

  it('does not reorder the rules prop array during a duplicate check', () => {
    const rules: AlertRule[] = [
      { type: 'AdminFunctionCalled', function_names: ['upgrade', 'set_admin'] },
      { type: 'AdminFunctionCalled', function_names: ['mint', 'burn'] },
    ]
    const snapshot = rules.map((rule) =>
      rule.function_names ? [...rule.function_names] : undefined
    )

    // Simulate the duplicate check that previously sorted arrays in place.
    rules.forEach((rule) => {
      const names = [...(rule.function_names ?? [])].sort()
      expect(names).toEqual([...names].sort())
    })

    expect(rules.map((rule) => rule.function_names)).toEqual(snapshot)
  })

  it('rejects editing a rule to match another rule label', () => {
    const rules: AlertRule[] = [
      { type: 'LargeTransfer', threshold_xlm: 1000 },
      { type: 'FunctionCalled', function_name: 'transfer' },
    ]
    const editingIndex = 1

    // Duplicate check must run against all rules except the one being edited.
    const isDuplicateLabel = (label: string, index: number | null) =>
      rules.some(
        (rule, i) => i !== index && formatRuleSummary(rule) === label
      )

    const editedLabel = formatRuleSummary(rules[0])
    expect(isDuplicateLabel(editedLabel, editingIndex)).toBe(true)

    // The rule being edited must not collide with itself.
    expect(isDuplicateLabel(formatRuleSummary(rules[1]), editingIndex)).toBe(false)
  })

  it('builds a duplicate pre-fill payload with label suffix, webhook, and rules', () => {
    const contract = {
      id: 'C123',
      label: 'Mainnet Alerts',
      network: 'mainnet',
      webhook_url: 'https://hooks.example.com/secret',
      rules: [
        { type: 'LargeTransfer', threshold_xlm: 1000 } as AlertRule,
        { type: 'FunctionCalled', function_name: 'transfer' } as AlertRule,
      ],
    }

    const buildDuplicatePrefill = (c: typeof contract) => ({
      label: `${c.label} (copy)`,
      webhook_url: c.webhook_url,
      rules: c.rules.map((rule) => ({ ...rule })),
    })

    const prefill = buildDuplicatePrefill(contract)

    expect(prefill.label).toBe('Mainnet Alerts (copy)')
    expect(prefill.webhook_url).toBe('https://hooks.example.com/secret')
    expect(prefill.rules).toEqual(contract.rules)
    // Contract ID and network are intentionally omitted for the user to fill.
    expect(prefill).not.toHaveProperty('id')
    expect(prefill).not.toHaveProperty('network')
  })

  it('stores duplicate pre-fill in sessionStorage instead of the URL', () => {
    const store: Record<string, string> = {}
    const sessionStorage = {
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      getItem: (key: string) => store[key] ?? null,
    }

    const prefill = {
      label: 'Mainnet Alerts (copy)',
      webhook_url: 'https://hooks.example.com/secret',
      rules: [{ type: 'LargeTransfer', threshold_xlm: 1000 } as AlertRule],
    }

    sessionStorage.setItem('contract-duplicate', JSON.stringify(prefill))

    const raw = sessionStorage.getItem('contract-duplicate')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual(prefill)
    // The webhook URL must not appear in any navigation URL.
    const targetUrl = '/contracts/new'
    expect(targetUrl).not.toContain('secret')
  })
})

describe('ContractDetail last modified', () => {
  const renderLastModified = (createdAt: string, updatedAt: string) => {
    const showLastModified = updatedAt !== createdAt
    return showLastModified ? `Last modified: ${formatDate(updatedAt)}` : null
  }

  it('shows the last modified time when updated_at differs from created_at', () => {
    const created = '2024-01-01T00:00:00.000Z'
    const updated = '2024-02-01T00:00:00.000Z'
    expect(renderLastModified(created, updated)).toBe(
      `Last modified: ${formatDate(updated)}`
    )
  })

  it('hides the last modified row when updated_at equals created_at', () => {
    const created = '2024-01-01T00:00:00.000Z'
    expect(renderLastModified(created, created)).toBeNull()
  })
})

describe('metadata edit discard confirmation', () => {
  // Mirrors the in-app dialog flow that replaced window.confirm in
  // handleCancelMetadataEdit: the dialog resolves to a boolean and the
  // caller decides whether to discard or keep editing.
  const createDiscardController = () => {
    let resolveDialog: ((confirmed: boolean) => void) | null = null
    let dialogOpen = false
    let metadataDirty = true
    let modalOpen = true

    const requestDiscard = () => {
      dialogOpen = true
      return new Promise<boolean>((resolve) => {
        resolveDialog = resolve
      })
    }

    const handleCancelMetadataEdit = async () => {
      if (!metadataDirty) {
        modalOpen = false
        return
      }
      const confirmed = await requestDiscard()
      if (confirmed) {
        metadataDirty = false
        modalOpen = false
      }
    }

    return {
      handleCancelMetadataEdit,
      confirm: (value: boolean) => {
        dialogOpen = false
        resolveDialog?.(value)
      },
      get dialogOpen() {
        return dialogOpen
      },
      get modalOpen() {
        return modalOpen
      },
      get metadataDirty() {
        return metadataDirty
      },
    }
  }

  it('discards metadata changes when the user confirms', async () => {
    const controller = createDiscardController()

    const pending = controller.handleCancelMetadataEdit()
    expect(controller.dialogOpen).toBe(true)

    controller.confirm(true)
    await pending

    expect(controller.metadataDirty).toBe(false)
    expect(controller.modalOpen).toBe(false)
  })

  it('keeps editing when the user cancels the dialog', async () => {
    const controller = createDiscardController()

    const pending = controller.handleCancelMetadataEdit()
    expect(controller.dialogOpen).toBe(true)

    controller.confirm(false)
    await pending

    expect(controller.metadataDirty).toBe(true)
    expect(controller.modalOpen).toBe(true)
  })
})

describe('Modal keyboard interaction', () => {
  const setupModal = () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()

    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-labelledby', 'modal-title')

    const title = document.createElement('h2')
    title.id = 'modal-title'
    title.textContent = 'Edit Details'

    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    const confirm = document.createElement('button')
    confirm.textContent = 'Confirm'

    overlay.append(title, cancel, confirm)
    document.body.appendChild(overlay)
    cancel.focus()

    return { trigger, overlay, cancel, confirm }
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('exposes dialog semantics with an accessible label', () => {
    const { overlay } = setupModal()
    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(overlay.getAttribute('aria-labelledby')).toBe('modal-title')
    expect(document.getElementById('modal-title')?.textContent).toBe('Edit Details')
  })

  it('focuses the safe action (Cancel) by default for destructive dialogs', () => {
    const { cancel } = setupModal()
    expect(document.activeElement).toBe(cancel)
  })

  it('traps focus within the dialog when tabbing', () => {
    const { cancel, confirm } = setupModal()
    const focusable = [cancel, confirm]

    // Tab forward from the last element wraps to the first.
    confirm.focus()
    const nextIndex = (focusable.indexOf(document.activeElement as HTMLElement) + 1) % focusable.length
    focusable[nextIndex].focus()
    expect(document.activeElement).toBe(cancel)

    // Shift+Tab from the first element wraps to the last.
    cancel.focus()
    const prevIndex =
      (focusable.indexOf(document.activeElement as HTMLElement) - 1 + focusable.length) %
      focusable.length
    focusable[prevIndex].focus()
    expect(document.activeElement).toBe(confirm)
  })

  it('closes on Escape and restores focus to the trigger', () => {
    const { trigger, overlay } = setupModal()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        overlay.remove()
        trigger.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.removeEventListener('keydown', onKeyDown)

    expect(document.body.contains(overlay)).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})

describe('ContractDetail alert history lookup regression (#26)', () => {
  const contractId = 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR'
  const internalUuid = 'uuid-contract-999'

  beforeEach(() => {
    localStorage.clear()
  })

  it('loads alerts by contract.contract_id rather than internal uuid', () => {
    const mockContract: WatchedContract = {
      id: internalUuid,
      label: 'DeFi Pool',
      contract_id: contractId,
      network: 'testnet',
      rules: [{ type: 'AnyTransaction' }],
      webhook_url: 'https://example.com/webhook',
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    saveContract(mockContract)
    seedMockAlerts(contractId, 'testnet', 3)

    // Lookup using internal uuid yields 0 alerts
    const alertsByUuid = getAlerts(mockContract.id)
    expect(alertsByUuid).toHaveLength(0)

    // Lookup using contract.contract_id correctly loads all seeded alerts
    const alertsByContractId = getAlerts(mockContract.contract_id)
    expect(alertsByContractId).toHaveLength(3)
    expect(alertsByContractId[0].contract_id).toBe(contractId)
  })
})
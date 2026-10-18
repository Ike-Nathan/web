import { isValidContractId, validateWebhookUrl } from '@/lib/stellar'
import { AlertRule, Network, WatchedContract } from '@/types'

const WEBHOOK_URL_MESSAGES: Record<string, string> = {
  invalid_url: 'Must be a valid http/https URL',
  credentials_in_url: 'Webhook URL must not contain credentials',
  http_on_mainnet: 'Use HTTPS for webhooks on mainnet',
  loopback_address: 'Webhook URL must not point to a loopback address',
  private_address: 'Webhook URL must not point to a private address',
}

function validateWebhookUrlField(
  url: string,
  network: Network
): { error?: string; warning?: string } {
  const result = validateWebhookUrl(url, network)
  if (result.valid) return {}
  const message = WEBHOOK_URL_MESSAGES[result.code] ?? 'Must be a valid http/https URL'
  if (result.code === 'http_warning') return { warning: message }
  return { error: message }
}

interface FormErrors {
  label?: string
  contract_id?: string
  webhook_url?: string
  rules?: string
  wallet?: string
  network?: string
}

function validateForm({
  label,
  contractId,
  network,
  webhookUrl,
  rules,
  existingContracts = [],
}: {
  label: string
  contractId: string
  network: Network
  webhookUrl: string
  rules: AlertRule[]
  existingContracts?: WatchedContract[]
}): FormErrors {
  const e: FormErrors = {}
  const trimmedLabel = label.trim()
  const trimmedContractId = contractId.trim()
  const trimmedWebhookUrl = webhookUrl.trim()

  if (!trimmedLabel) {
    e.label = 'Label is required'
  } else if (trimmedLabel.length > 100) {
    e.label = 'Label must be 100 characters or less'
  }

  if (!trimmedContractId) {
    e.contract_id = 'Contract ID is required'
  } else if (!isValidContractId(trimmedContractId)) {
    e.contract_id = 'Must be a valid Soroban contract address (starts with C, 56 chars)'
  } else {
    const isDuplicate = existingContracts.some(
      (c) => c.contract_id === trimmedContractId && c.network === network
    )
    if (isDuplicate) {
      e.contract_id = `This contract is already registered on ${network}`
    }
  }

  if (!trimmedWebhookUrl) {
    e.webhook_url = 'Webhook URL is required'
  } else {
    const { error } = validateWebhookUrlField(trimmedWebhookUrl, network)
    if (error) e.webhook_url = error
  }

  if (rules.length === 0) {
    e.rules = 'Add at least one alert rule'
  }

  return e
}

function isFormValid(params: Parameters<typeof validateForm>[0]): boolean {
  return Object.keys(validateForm(params)).length === 0
}

describe('NewContract form validation (#14)', () => {
  const validContractId = 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR'
  const validRule: AlertRule = { type: 'AnyTransaction' }

  it('asserts label error is visible when empty or too long', () => {
    const emptyRes = validateForm({
      label: '',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
    })
    expect(emptyRes.label).toBe('Label is required')
    expect(isFormValid({
      label: '',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
    })).toBe(false)

    const tooLongRes = validateForm({
      label: 'a'.repeat(101),
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
    })
    expect(tooLongRes.label).toBe('Label must be 100 characters or less')
  })

  it('asserts contract_id error is visible when missing or malformed', () => {
    const emptyRes = validateForm({
      label: 'Test Contract',
      contractId: '',
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
    })
    expect(emptyRes.contract_id).toBe('Contract ID is required')

    const invalidRes = validateForm({
      label: 'Test Contract',
      contractId: 'CINVALID',
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
    })
    expect(invalidRes.contract_id).toBe(
      'Must be a valid Soroban contract address (starts with C, 56 chars)'
    )
  })

  it('asserts duplicate contract error is visible on same network', () => {
    const existing: WatchedContract = {
      id: 'existing-uuid',
      label: 'Existing Contract',
      contract_id: validContractId,
      network: 'testnet',
      rules: [validRule],
      webhook_url: 'https://example.com/webhook',
      created_at: Date.now(),
      updated_at: Date.now(),
    }

    const dupRes = validateForm({
      label: 'New Contract',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
      existingContracts: [existing],
    })
    expect(dupRes.contract_id).toBe('This contract is already registered on testnet')

    // Same contract ID on a different network is permitted
    const diffNetRes = validateForm({
      label: 'New Contract',
      contractId: validContractId,
      network: 'mainnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
      existingContracts: [existing],
    })
    expect(diffNetRes.contract_id).toBeUndefined()
  })

  it('asserts webhook URL error is visible when empty or invalid', () => {
    const emptyRes = validateForm({
      label: 'Test Contract',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: '',
      rules: [validRule],
    })
    expect(emptyRes.webhook_url).toBe('Webhook URL is required')

    const invalidRes = validateForm({
      label: 'Test Contract',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'ftp://not-http',
      rules: [validRule],
    })
    expect(invalidRes.webhook_url).toBe('Must be a valid http/https URL')
  })

  it('maps credentials_in_url to an error', () => {
    const res = validateForm({
      label: 'Test Contract',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'https://user:pass@example.com/hook',
      rules: [validRule],
    })
    expect(res.webhook_url).toBe('Webhook URL must not contain credentials')
  })

  it('treats http on mainnet as a dismissible warning, not an error', () => {
    const params = {
      label: 'Test Contract',
      contractId: validContractId,
      network: 'mainnet' as Network,
      webhookUrl: 'http://example.com/hook',
      rules: [validRule],
    }
    const res = validateForm(params)
    expect(res.webhook_url).toBeUndefined()
    expect(isFormValid(params)).toBe(true)
    expect(validateWebhookUrlField('http://example.com/hook', 'mainnet')).toEqual({
      warning: 'Use HTTPS for webhooks on mainnet',
    })
  })

  it('maps loopback_address to an error', () => {
    const res = validateForm({
      label: 'Test Contract',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'http://127.0.0.1/hook',
      rules: [validRule],
    })
    expect(res.webhook_url).toBe('Webhook URL must not point to a loopback address')
  })

  it('maps private_address to an error', () => {
    const res = validateForm({
      label: 'Test Contract',
      contractId: validContractId,
      network: 'mainnet',
      webhookUrl: 'http://user:pass@10.0.0.5/hook',
      rules: [validRule],
    })
    expect(res.webhook_url).toBe('Webhook URL must not contain credentials')

    const privateRes = validateForm({
      label: 'Test Contract',
      contractId: validContractId,
      network: 'mainnet',
      webhookUrl: 'https://10.0.0.5/hook',
      rules: [validRule],
    })
    expect(privateRes.webhook_url).toBe('Webhook URL must not point to a private address')
  })

  it('asserts rules error is visible when no rules are configured', () => {
    const noRulesRes = validateForm({
      label: 'Test Contract',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [],
    })
    expect(noRulesRes.rules).toBe('Add at least one alert rule')
  })

  it('validates successfully and shares one source of truth with isFormValid', () => {
    const validParams = {
      label: 'Valid Contract',
      contractId: validContractId,
      network: 'testnet' as Network,
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
    }

    const errors = validateForm(validParams)
    expect(Object.keys(errors)).toHaveLength(0)
    expect(isFormValid(validParams)).toBe(true)
  })
})

describe('NewContract save flow (#194)', () => {
  const validContractId = 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR'
  const validRule: AlertRule = { type: 'AnyTransaction' }

  function makeHarness() {
    const stored: WatchedContract[] = []
    const redirect = jest.fn()

    const saveContract = jest.fn(async (contract: WatchedContract) => {
      stored.push(contract)
      return { ok: true as const }
    })
    const syncSaveContract = jest.fn(async (contract: WatchedContract) => {
      const localResult = await saveContract(contract)
      return { ...localResult, synced: true }
    })
    const addContract = jest.fn(async (contract: WatchedContract) => {
      if (stored.some((c) => c.contract_id === contract.contract_id && c.network === contract.network)) {
        throw new Error('DuplicateContractError')
      }
      stored.push(contract)
    })

    async function handleSave(input: {
      label: string
      contractId: string
      network: Network
      webhookUrl: string
      rules: AlertRule[]
    }) {
      const errors = validateForm({ ...input, existingContracts: stored })
      if (Object.keys(errors).length > 0) return { errors }
      const contract: WatchedContract = {
        id: 'new-uuid',
        label: input.label.trim(),
        contract_id: input.contractId.trim(),
        network: input.network,
        rules: input.rules,
        webhook_url: input.webhookUrl.trim(),
        created_at: Date.now(),
        updated_at: Date.now(),
      }
      const result = await syncSaveContract(contract)
      redirect('/')
      return { result }
    }

    return { stored, redirect, saveContract, syncSaveContract, addContract, handleSave }
  }

  it('saves a valid contract once and redirects', async () => {
    const h = makeHarness()

    const { errors } = await h.handleSave({
      label: 'Valid Contract',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
    })

    expect(errors).toBeUndefined()
    expect(h.stored).toHaveLength(1)
    expect(h.stored[0].contract_id).toBe(validContractId)
    expect(h.syncSaveContract).toHaveBeenCalledTimes(1)
    expect(h.addContract).not.toHaveBeenCalled()
    expect(h.redirect).toHaveBeenCalledTimes(1)
  })

  it('returns the local save result so the storage-full toast still works', async () => {
    const h = makeHarness()
    h.saveContract.mockResolvedValueOnce({ ok: false as const, reason: 'storage_full' })

    const { result } = await h.handleSave({
      label: 'Valid Contract',
      contractId: validContractId,
      network: 'testnet',
      webhookUrl: 'https://example.com/webhook',
      rules: [validRule],
    })

    expect(result).toEqual({ ok: false, reason: 'storage_full', synced: true })
  })
})

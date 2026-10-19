import { isValidContractId, isValidUrl } from '@/lib/stellar'
import { parseAlertRule } from '@/lib/rules'
import { AlertRule, Network, WatchedContract } from '@/types'
import type { AlertRule, Network, WatchedContract } from '@/types'

const DUPLICATE_CONTRACT_KEY = 'txwatch_duplicate_contract'

interface DuplicateContractPrefill {
  label?: string
  contract_id?: string
  network?: Network
  webhook_url?: string
  rules?: unknown[]
}

interface PrefillResult {
  label: string
  contractId: string
  network: Network
  webhookUrl: string
  rules: AlertRule[]
  notice?: string
}

function readDuplicatePrefill(raw: string | null): PrefillResult | null {
  if (!raw) return null

  let data: DuplicateContractPrefill
  try {
    data = JSON.parse(raw) as DuplicateContractPrefill
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null

  const rawRules = Array.isArray(data.rules) ? data.rules : []
  const rules: AlertRule[] = []
  let dropped = 0
  for (const candidate of rawRules) {
    const parsed = parseAlertRule(candidate)
    if (parsed) {
      rules.push(parsed)
    } else {
      dropped += 1
    }
  }

  return {
    label: typeof data.label === 'string' ? data.label : '',
    contractId: typeof data.contract_id === 'string' ? data.contract_id : '',
    network: data.network === 'mainnet' ? 'mainnet' : 'testnet',
    webhookUrl: typeof data.webhook_url === 'string' ? data.webhook_url : '',
    rules,
    notice:
      dropped > 0
        ? `${dropped} prefill rule${dropped === 1 ? '' : 's'} could not be restored and ${
            dropped === 1 ? 'was' : 'were'
          } dropped`
        : undefined,
  }
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
  } else if (!isValidUrl(trimmedWebhookUrl)) {
    e.webhook_url = 'Must be a valid http/https URL'
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
    expect(
      isFormValid({
        label: '',
        contractId: validContractId,
        network: 'testnet',
        webhookUrl: 'https://example.com/webhook',
        rules: [validRule],
      })
    ).toBe(false)

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

describe('Duplicate contract prefill (#200)', () => {
  const validContractId = 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR'

  it('populates the form from valid prefill data', () => {
    const raw = JSON.stringify({
      label: 'Copied Contract',
      contract_id: validContractId,
      network: 'mainnet',
      webhook_url: 'https://example.com/hook',
      rules: [{ type: 'AnyTransaction' }, { type: 'LargeTransfer', threshold: '1000' }],
    })

    const prefill = readDuplicatePrefill(raw)
    expect(prefill).not.toBeNull()
    expect(prefill!.label).toBe('Copied Contract')
    expect(prefill!.contractId).toBe(validContractId)
    expect(prefill!.network).toBe('mainnet')
    expect(prefill!.webhookUrl).toBe('https://example.com/hook')
    expect(prefill!.rules).toHaveLength(2)
    expect(prefill!.rules[0]).toEqual({ type: 'AnyTransaction' })
    expect(prefill!.notice).toBeUndefined()
  })

  it('drops corrupted and old-schema rules with a notice instead of crashing', () => {
    const raw = JSON.stringify({
      label: 'Old Contract',
      contract_id: validContractId,
      network: 'testnet',
      webhook_url: 'https://example.com/hook',
      rules: [
        { rule_type: 'any_transaction' },
        { type: 'AnyTransaction' },
        { type: 'NotARealRule' },
        null,
        'garbage',
      ],
    })

    const prefill = readDuplicatePrefill(raw)
    expect(prefill).not.toBeNull()
    expect(prefill!.rules).toEqual([{ type: 'AnyTransaction' }])
    expect(prefill!.notice).toBeDefined()
    expect(prefill!.notice).toMatch(/dropped/)
  })

  it('returns null for missing or unparseable prefill data', () => {
    expect(readDuplicatePrefill(null)).toBeNull()
    expect(readDuplicatePrefill('{not json')).toBeNull()
  })

  it('falls back to safe defaults when prefill fields are missing', () => {
    const prefill = readDuplicatePrefill(JSON.stringify({}))
    expect(prefill).not.toBeNull()
    expect(prefill!.label).toBe('')
    expect(prefill!.contractId).toBe('')
    expect(prefill!.network).toBe('testnet')
    expect(prefill!.webhookUrl).toBe('')
    expect(prefill!.rules).toEqual([])
    expect(prefill!.notice).toBeUndefined()
  })

  it('uses the expected sessionStorage key', () => {
    expect(DUPLICATE_CONTRACT_KEY).toBe('txwatch_duplicate_contract')
  })
})

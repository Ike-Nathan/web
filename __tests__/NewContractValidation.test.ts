import { isValidContractId, isValidUrl } from '@/lib/stellar'
import type { AlertRule, Network, WatchedContract } from '@/types'

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

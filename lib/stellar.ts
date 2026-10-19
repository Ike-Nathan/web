import { Network } from '@/types'
import { Address, xdr } from '@stellar/stellar-sdk'
import { StrKey } from '@stellar/stellar-sdk'
import { sorobanRpcUrl } from './networkUrls.mjs'
export {
  HORIZON_URLS,
  SOROBAN_RPC_URLS,
  horizonUrl,
  sorobanRpcUrl,
} from './networkUrls.mjs'

export const STELLAR_EXPERT_BASE = 'https://stellar.expert/explorer'

export function explorerTxUrl(network: Network, txHash: string): string {
  const net = network === 'mainnet' ? 'public' : network
  return `${STELLAR_EXPERT_BASE}/${net}/tx/${txHash}`
}

export function explorerContractUrl(
  network: Network,
  contractId: string
): string {
  const net = network === 'mainnet' ? 'public' : network
  return `${STELLAR_EXPERT_BASE}/${net}/contract/${contractId}`
}

/**
 * Maps Freighter network strings (e.g. PUBLIC, TESTNET, FUTURENET) to the app Network type (#8).
 */
export function mapFreighterNetwork(
  freighterNetwork: string | null | undefined
): Network | null {
  if (!freighterNetwork) return null
  const normalized = freighterNetwork.trim().toUpperCase()
  switch (normalized) {
    case 'PUBLIC':
    case 'MAINNET':
      return 'mainnet'
    case 'TESTNET':
      return 'testnet'
    case 'FUTURENET':
      return 'futurenet'
    default:
      return null
  }
}

export function truncateId(id: string, chars = 8): string {
  if (id.length <= chars * 2 + 3) return id
  return `${id.slice(0, chars)}...${id.slice(-chars)}`
}

export function isValidContractId(id: string): boolean {
  if (!id || typeof id !== 'string') return false
  try {
    return StrKey.isValidContract(id)
  } catch {
    return false
  }
}

export interface NormalizedContractIdResult {
  contractId: string
  network?: Network
}

/**
 * Normalizes user-pasted contract IDs (#16):
 * - Trims and removes surrounding whitespace/newlines
 * - Extracts contract ID and network from explorer URLs
 * - Converts to uppercase
 */
export function normalizeContractId(input: string): NormalizedContractIdResult {
  if (!input) return { contractId: '' }
  let cleaned = input.trim()

  const explorerMatch = cleaned.match(
    /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?stellar\.expert\/explorer\/(public|testnet|futurenet)\/contract\/([A-Za-z0-9]+)/i
  )

  if (explorerMatch) {
    const rawNetwork = explorerMatch[1].toLowerCase()
    const rawId = explorerMatch[2].trim().toUpperCase()
    const network: Network =
      rawNetwork === 'public' ? 'mainnet' : (rawNetwork as Network)
    return {
      contractId: rawId,
      network,
    }
  }

  const pathMatch = cleaned.match(/\/contract\/([A-Za-z0-9]+)/i)
  if (pathMatch) {
    return {
      contractId: pathMatch[1].trim().toUpperCase(),
    }
  }

  cleaned = cleaned.replace(/\s+/g, '').toUpperCase()
  return {
    contractId: cleaned,
  }
}

function buildContractInstanceLedgerKey(contractId: string): string {
  try {
    const address = Address.fromString(contractId)
    const durability = xdr.ContractDataDurability.persistent()
    const ledgerKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: address.toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability,
      })
    )
    return ledgerKey.toXDR('base64')
  } catch {
    return ''
  }
}

/**
 * Checks whether a contract exists on the target network via Soroban RPC (#17).
 * Gracefully resolves true if RPC times out or is unreachable.
 */
export async function contractExists(
  network: Network,
  contractId: string,
  timeoutMs = 5000
): Promise<boolean> {
  const url = sorobanRpcUrl(network)
  const key = buildContractInstanceLedgerKey(contractId)
  if (!key) return false

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLedgerEntries',
        params: {
          keys: [key],
        },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return true
    }

    const data = await res.json()
    if (data?.error) {
      return true
    }

    const entries = data?.result?.entries
    if (Array.isArray(entries)) {
      return entries.length > 0
    }

    return true
  } catch {
    return true
  } finally {
    clearTimeout(timeout)
  }
}

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** #117: Codes returned by validateWebhookUrl. */
export type WebhookUrlErrorCode =
  | 'invalid_url'
  | 'credentials_in_url'
  | 'http_on_mainnet'
  | 'http_warning'
  | 'loopback_not_allowed'
  | 'private_ip_not_allowed'
  | 'link_local_not_allowed'

export interface WebhookUrlValidationResult {
  /** True when the URL may be submitted (http_warning is still valid). */
  valid: boolean
  /** Error code, or null when there is nothing to report. */
  code: WebhookUrlErrorCode | null
  /** True when the code is a dismissible warning rather than a blocking error. */
  warning: boolean
  /** User-facing message for the code, or null when there is nothing to report. */
  message: string | null
}

/** User-facing messages for each webhook URL validation code. */
export const WEBHOOK_URL_MESSAGES: Record<WebhookUrlErrorCode, string> = {
  invalid_url: 'Enter a valid URL starting with http:// or https://.',
  credentials_in_url: 'Remove the username and password from the URL.',
  http_on_mainnet: 'Plain http:// webhooks are not allowed on mainnet. Use https://.',
  http_warning: 'This webhook uses plain http://. Use https:// in production.',
  loopback_not_allowed: 'Loopback addresses (localhost, 127.0.0.1, ::1) are not allowed.',
  private_ip_not_allowed: 'Private IP addresses are not allowed.',
  link_local_not_allowed: 'Link-local addresses are not allowed.',
}

/** Maps a validation code to its user-facing message. */
export function webhookUrlMessage(code: WebhookUrlErrorCode | null): string | null {
  return code ? WEBHOOK_URL_MESSAGES[code] : null
}

/** #117: Validate webhook URLs with security checks. */
export function validateWebhookUrl(url: string, network: Network): WebhookUrlValidationResult {
  const result = (code: WebhookUrlErrorCode | null): WebhookUrlValidationResult => ({
    valid: code === null || code === 'http_warning',
    code,
    warning: code === 'http_warning',
    message: webhookUrlMessage(code),
  })

  if (!isValidUrl(url)) return result('invalid_url')
/** #117: Validate webhook URLs with security checks. Returns error/warning code or null if valid. */
export function validateWebhookUrl(
  url: string,
  network: Network
): string | null {
  if (!isValidUrl(url)) return 'invalid_url'

  try {
    const u = new URL(url)

    // Reject URLs with embedded credentials
    if (u.username || u.password) return result('credentials_in_url')

    // Warn on plain http (block for mainnet)
    if (u.protocol === 'http:') return result(network === 'mainnet' ? 'http_on_mainnet' : 'http_warning')

    // Reject localhost and private IP ranges
    const hostname = u.hostname || ''
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return result('loopback_not_allowed')
    }

    // Reject private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fe80::/10)
    if (/^(10|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\./.test(hostname) ||
        hostname.startsWith('fc') || hostname.startsWith('fd') ||
        hostname.startsWith('fe80')) {
      return result('private_ip_not_allowed')
    if (u.protocol === 'http:')
      return network === 'mainnet' ? 'http_on_mainnet' : 'http_warning'

    // Reject localhost and private IP ranges
    const hostname = u.hostname || ''
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    ) {
      return 'loopback_not_allowed'
    }

    // Reject private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fe80::/10)
    if (
      /^(10|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\./.test(hostname) ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80')
    ) {
      return 'private_ip_not_allowed'
    }

    // Reject link-local addresses (169.254.0.0/16, fe80::/10)
    if (/^169\.254\./.test(hostname)) return result('link_local_not_allowed')

    return result(null)
  } catch {
    return result('invalid_url')
  }
}

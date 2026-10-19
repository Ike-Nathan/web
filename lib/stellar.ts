import { Network } from '@/types'
import { StrKey } from '@stellar/stellar-sdk'
import { classifyHost } from '@/lib/ipRanges'
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
 * Delegates to the canonical bidirectional map in lib/freighter.ts (#187).
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
  http_on_mainnet:
    'Plain http:// webhooks are not allowed on mainnet. Use https://.',
  http_warning: 'This webhook uses plain http://. Use https:// in production.',
  loopback_not_allowed:
    'Loopback addresses (localhost, 127.0.0.1, ::1) are not allowed.',
  private_ip_not_allowed: 'Private IP addresses are not allowed.',
  link_local_not_allowed: 'Link-local addresses are not allowed.',
}

/** Maps a validation code to its user-facing message. */
export function webhookUrlMessage(
  code: WebhookUrlErrorCode | null
): string | null {
  return code ? WEBHOOK_URL_MESSAGES[code] : null
}

/** #117: Validate webhook URLs with security checks. */
export function validateWebhookUrl(
  url: string,
  network: Network
): WebhookUrlValidationResult {
  const result = (
    code: WebhookUrlErrorCode | null
  ): WebhookUrlValidationResult => ({
    valid: code === null || code === 'http_warning',
    code,
    warning: code === 'http_warning',
    message: webhookUrlMessage(code),
  })

  if (!isValidUrl(url)) return result('invalid_url')

  try {
    const u = new URL(url)

    // Reject URLs with embedded credentials
    if (u.username || u.password) return result('credentials_in_url')

    // Reject loopback, private, link-local and other reserved ranges (#260)
    const hostClass = classifyHost(u.hostname)
    if (hostClass === 'loopback') return result('loopback_not_allowed')
    if (hostClass === 'linkLocal') return result('link_local_not_allowed')
    if (hostClass === 'private') return result('private_ip_not_allowed')

    // Warn on plain http (block for mainnet)
    if (u.protocol === 'http:')
      return result(network === 'mainnet' ? 'http_on_mainnet' : 'http_warning')

    return result(null)
  } catch {
    return result('invalid_url')
  }
}

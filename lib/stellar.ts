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

export {
  STELLAR_EXPERT_BASE,
  explorerTxUrl,
  explorerContractUrl,
} from './explorer'
export const STELLAR_EXPERT_BASE = 'https://stellar.expert/explorer'

export function resolveExplorerNetwork(network?: string): string {
  if (!network) return 'public'
  const lower = network.toLowerCase()
  if (lower === 'mainnet') return 'public'
  return lower
}

export function explorerTxUrl(network: Network | string, txHash: string): string {
  const net = resolveExplorerNetwork(network)
  return `${STELLAR_EXPERT_BASE}/${net}/tx/${txHash}`
}

export function explorerContractUrl(
  network: Network | string,
  contractId: string
): string {
  const net = resolveExplorerNetwork(network)
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

/** Looks like a URL or a bare host/path, e.g. "stellarchain.io/contracts/C…". */
const URL_LIKE = /^(?:https?:\/\/|www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/|\/)/i
/**
 * A StrKey once whitespace/line breaks are removed: a version letter plus 55
 * base32 characters (68 for a muxed M… address).
 */
const STRKEY_LIKE = /^[A-Z][A-Z2-7]{55}(?:[A-Z2-7]{13})?$/i
/** Candidate contract IDs inside a URL. */
const CONTRACT_CANDIDATE = /C[A-Z2-7]{55}(?![A-Z2-7])/gi

function networkFromUrl(url: string): Network | undefined {
  const lower = url.toLowerCase()
  // stellar.expert: /explorer/<public|testnet|futurenet>/
  const expert = lower.match(/stellar\.expert\/explorer\/(public|testnet|futurenet)\//)
  if (expert) return expert[1] === 'public' ? 'mainnet' : (expert[1] as Network)
  // Stellar Lab: ?$=network$id=<testnet|futurenet|mainnet>
  const lab = lower.match(/network\$id=(testnet|futurenet|mainnet|public)/)
  if (lab) return lab[1] === 'public' ? 'mainnet' : (lab[1] as Network)
  // StellarChain: testnet./futurenet. subdomains; the bare host is mainnet.
  const chain = lower.match(/(?:^|\/\/)(?:(testnet|futurenet)\.)?(?:www\.)?stellarchain\.io\b/)
  if (chain) return (chain[1] as Network | undefined) ?? 'mainnet'
  // Anything else (e.g. explorers linked from Freighter): look for the name.
  if (/\bfuturenet\b/.test(lower)) return 'futurenet'
  if (/\btestnet\b/.test(lower)) return 'testnet'
  if (/\b(?:public|pubnet|mainnet)\b/.test(lower)) return 'mainnet'
  return undefined
}

/**
 * Normalizes user-pasted contract IDs (#16):
 * - URLs (stellar.expert, StellarChain, Stellar Lab and other explorers):
 *   extracts the contract ID and, when recognisable, the network
 * - Bare StrKeys: removes whitespace/line breaks and upper-cases
 * - Anything else is returned untouched, so the user still sees what they
 *   pasted and gets a meaningful validation error
 */
export function normalizeContractId(input: string): NormalizedContractIdResult {
  if (!input) return { contractId: '' }
  const trimmed = input.trim()

  if (URL_LIKE.test(trimmed)) {
    const candidates = trimmed.match(CONTRACT_CANDIDATE) ?? []
    const contractId = candidates
      .map((c) => c.toUpperCase())
      .find((c) => isValidContractId(c))
    if (contractId) {
      const network = networkFromUrl(trimmed)
      return network ? { contractId, network } : { contractId }
    }
    // Keep supporting bare explorer paths such as /contract/<id>.
    const pathMatch = trimmed.match(/\/contracts?\/([A-Za-z0-9]+)/i)
    if (pathMatch) {
      const network = networkFromUrl(trimmed)
      const id = pathMatch[1].toUpperCase()
      return network ? { contractId: id, network } : { contractId: id }
    }
    return { contractId: input }
  }

  const compact = trimmed.replace(/\s+/g, '')
  if (STRKEY_LIKE.test(compact)) {
    return { contractId: compact.toUpperCase() }
  }

  return { contractId: input }
}

/**
 * A specific hint when the input is a valid Stellar address that is not a
 * contract (an account G… or muxed account M…), or null otherwise.
 */
export function nonContractAddressHint(input: string): string | null {
  const id = input.trim().toUpperCase()
  try {
    if (StrKey.isValidEd25519PublicKey(id)) {
      return 'This is an account address (G…), not a contract. Paste the contract ID, which starts with C.'
    }
    if (StrKey.isValidMed25519PublicKey(id)) {
      return 'This is a muxed account address (M…), not a contract. Paste the contract ID, which starts with C.'
    }
  } catch {
    // not a StrKey
  }
  return null
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

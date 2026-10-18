import { Network } from '@/types'
import { Address, xdr } from '@stellar/stellar-sdk'
import { StrKey } from '@stellar/stellar-sdk'
import { freighterNetworkToAppNetwork } from '@/lib/freighter'

export const HORIZON_URLS: Record<Network, string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
  futurenet: 'https://horizon-futurenet.stellar.org',
}

export const SOROBAN_RPC_URLS: Record<Network, string> = {
  mainnet: 'https://mainnet.stellar.validationcloud.io/v1/soroban/rpc',
  testnet: 'https://soroban-testnet.stellar.org',
  futurenet: 'https://rpc-futurenet.stellar.org',
}

function clean(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/\/+$/, '')
  return t ? t : undefined
}

// NEXT_PUBLIC_* vars are inlined by Next.js only for literal `process.env.NAME`
// accesses, so each variable is spelled out (no dynamic lookup).
/**
 * Horizon URL for a network. Precedence: NEXT_PUBLIC_HORIZON_URL_<NETWORK>,
 * then NEXT_PUBLIC_HORIZON_URL (applies to every network), then the default.
 */
export function horizonUrl(network: Network): string {
  const perNetwork = {
    mainnet: process.env.NEXT_PUBLIC_HORIZON_URL_MAINNET,
    testnet: process.env.NEXT_PUBLIC_HORIZON_URL_TESTNET,
    futurenet: process.env.NEXT_PUBLIC_HORIZON_URL_FUTURENET,
  }[network]
  return clean(perNetwork) ?? clean(process.env.NEXT_PUBLIC_HORIZON_URL) ?? HORIZON_URLS[network]
}

/** Soroban RPC URL for a network; same precedence as horizonUrl. */
export function sorobanRpcUrl(network: Network): string {
  const perNetwork = {
    mainnet: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET,
    testnet: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET,
    futurenet: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_FUTURENET,
  }[network]
  return (
    clean(perNetwork) ?? clean(process.env.NEXT_PUBLIC_SOROBAN_RPC_URL) ?? SOROBAN_RPC_URLS[network]
  )
}

export const STELLAR_EXPERT_BASE = 'https://stellar.expert/explorer'

export function explorerTxUrl(network: Network, txHash: string): string {
  const net = network === 'mainnet' ? 'public' : network
  return `${STELLAR_EXPERT_BASE}/${net}/tx/${txHash}`
}

export function explorerContractUrl(network: Network, contractId: string): string {
  const net = network === 'mainnet' ? 'public' : network
  return `${STELLAR_EXPERT_BASE}/${net}/contract/${contractId}`
}

/**
 * Resolve the network to use for explorer links. Prefers the alert's own
 * network when it is a valid Network, otherwise falls back to the contract's
 * network prop.
 */
export function resolveExplorerNetwork(
  alertNetwork: string | undefined,
  fallback: Network
): Network {
  return isNetwork(alertNetwork) ? alertNetwork : fallback
}

export function isNetwork(value: string | undefined): value is Network {
  return value === 'mainnet' || value === 'testnet' || value === 'futurenet'
}

/**
 * Maps Freighter network strings (e.g. PUBLIC, TESTNET, FUTURENET) to the app Network type (#8).
 * Delegates to the canonical bidirectional map in lib/freighter.ts (#187).
 */
export function mapFreighterNetwork(freighterNetwork: string | null | undefined): Network | null {
  return freighterNetworkToAppNetwork(freighterNetwork)
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
    const network: Network = rawNetwork === 'public' ? 'mainnet' : (rawNetwork as Network)
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

export function buildContractInstanceLedgerKey(contractId: string): string {
  try {
    const address = Address.fromString(contractId)
    const durability =
      typeof (xdr.ContractDataDurability as any)?.persistent === 'function'
        ? (xdr.ContractDataDurability as any).persistent()
        : (xdr.ContractDataDurability as any)?.persistent
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

/** #117: Validate webhook URLs with security checks. Returns error/warning code or null if valid. */
export function validateWebhookUrl(url: string, network: Network): string | null {
  if (!isValidUrl(url)) return 'invalid_url'

  try {
    const u = new URL(url)

    // Reject URLs with embedded credentials
    if (u.username || u.password) return 'credentials_in_url'

    // Warn on plain http (block for mainnet)
    if (u.protocol === 'http:') return network === 'mainnet' ? 'http_on_mainnet' : 'http_warning'

    // Reject localhost and private IP ranges
    const hostname = u.hostname || ''
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return 'loopback_not_allowed'
    }

    // Reject private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fe80::/10)
    if (/^(10|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\./.test(hostname) ||
        hostname.startsWith('fc') || hostname.startsWith('fd') ||
        hostname.startsWith('fe80')) {
      return 'private_ip_not_allowed'
    }

    // Reject link-local addresses (169.254.0.0/16, fe80::/10)
    if (/^169\.254\./.test(hostname)) return 'link_local_not_allowed'

    return null
  } catch {
    return 'invalid_url'
  }
}

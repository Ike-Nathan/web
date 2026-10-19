import type { Network } from '@/types'

/**
 * Block-explorer links for transactions and contracts.
 *
 * Templates come from NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_TX and
 * NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_CONTRACT, so teams on StellarChain, a
 * self-hosted explorer or a private network can point links elsewhere.
 * Placeholders:
 *   {network} - `public` (mainnet), `testnet` or `futurenet`; for any other
 *               (custom) network, its name as given
 *   {hash}    - the transaction hash or contract ID, URL-encoded
 * Unset or invalid templates fall back to stellar.expert.
 */

export const STELLAR_EXPERT_BASE = 'https://stellar.expert/explorer'

export const DEFAULT_EXPLORER_TX_TEMPLATE = `${STELLAR_EXPERT_BASE}/{network}/tx/{hash}`
export const DEFAULT_EXPLORER_CONTRACT_TEMPLATE = `${STELLAR_EXPERT_BASE}/{network}/contract/{hash}`

const KNOWN_NETWORKS: Record<Network, string> = {
  mainnet: 'public',
  testnet: 'testnet',
  futurenet: 'futurenet',
}

/** A usable template is an http(s) URL containing {hash}. */
function validTemplate(value: string | undefined): string | undefined {
  const template = value?.trim()
  if (!template || !template.includes('{hash}')) return undefined
  return /^https?:\/\//i.test(template) ? template : undefined
}

// NEXT_PUBLIC_* values are inlined at build time only when read literally.
function txTemplate(): string | undefined {
  return validTemplate(process.env.NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_TX)
}

function contractTemplate(): string | undefined {
  return validTemplate(process.env.NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_CONTRACT)
}

function render(
  custom: string | undefined,
  fallback: string,
  network: string | undefined,
  hash: string
): string | null {
  const known = KNOWN_NETWORKS[(network ?? 'mainnet') as Network]
  // stellar.expert only knows the public networks; a custom network needs a
  // configured template to get a link at all.
  if (!custom && !known) return null
  const template = custom ?? fallback
  return template
    .replace(/\{network\}/g, encodeURIComponent(known ?? network ?? ''))
    .replace(/\{hash\}/g, encodeURIComponent(hash))
}

/** Explorer link for a transaction, or null when none can be built. */
export function explorerTxUrl(network: Network, txHash: string): string
export function explorerTxUrl(
  network: string | undefined,
  txHash: string
): string | null
export function explorerTxUrl(
  network: string | undefined,
  txHash: string
): string | null {
  return render(txTemplate(), DEFAULT_EXPLORER_TX_TEMPLATE, network, txHash)
}

/** Explorer link for a contract, or null when none can be built. */
export function explorerContractUrl(
  network: Network,
  contractId: string
): string
export function explorerContractUrl(
  network: string | undefined,
  contractId: string
): string | null
export function explorerContractUrl(
  network: string | undefined,
  contractId: string
): string | null {
  return render(
    contractTemplate(),
    DEFAULT_EXPLORER_CONTRACT_TEMPLATE,
    network,
    contractId
  )
}

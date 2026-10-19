/** @typedef {import('../types').Network} Network */

/** @type {Record<Network, string>} */
export const HORIZON_URLS = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
  futurenet: 'https://horizon-futurenet.stellar.org',
}

/**
 * Default Soroban RPC endpoints. SDF runs no public mainnet RPC, so mainnet
 * uses Gateway.fm's keyless public endpoint (CORS-enabled). Validation Cloud
 * and other keyed providers need NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET; see
 * "Network endpoints" in the README.
 * @type {Record<Network, string>}
 */
export const SOROBAN_RPC_URLS = {
  mainnet: 'https://soroban-rpc.mainnet.stellar.gateway.fm',
  testnet: 'https://soroban-testnet.stellar.org',
  futurenet: 'https://rpc-futurenet.stellar.org',
}

function clean(value) {
  const trimmed = value?.trim().replace(/\/+$/, '')
  return trimmed || undefined
}

/** @param {Network} network */
export function horizonUrl(network) {
  const perNetwork = {
    mainnet: process.env.NEXT_PUBLIC_HORIZON_URL_MAINNET,
    testnet: process.env.NEXT_PUBLIC_HORIZON_URL_TESTNET,
    futurenet: process.env.NEXT_PUBLIC_HORIZON_URL_FUTURENET,
  }[network]
  return (
    clean(perNetwork) ??
    clean(process.env.NEXT_PUBLIC_HORIZON_URL) ??
    HORIZON_URLS[network]
  )
}

/** @param {Network} network */
export function sorobanRpcUrl(network) {
  const perNetwork = {
    mainnet: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET,
    testnet: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET,
    futurenet: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_FUTURENET,
  }[network]
  return (
    clean(perNetwork) ??
    clean(process.env.NEXT_PUBLIC_SOROBAN_RPC_URL) ??
    SOROBAN_RPC_URLS[network]
  )
}

/** @type {Network[]} */
const NETWORKS = ['mainnet', 'testnet', 'futurenet']

/**
 * Origins of every network's resolved Horizon and Soroban RPC endpoint
 * (overrides included), deduplicated, for the CSP connect-src allow-list.
 * @returns {string[]}
 */
export function networkOrigins() {
  const origins = NETWORKS.flatMap((network) => [
    new URL(horizonUrl(network)).origin,
    new URL(sorobanRpcUrl(network)).origin,
  ])
  return origins.filter((origin, i) => origins.indexOf(origin) === i)
}

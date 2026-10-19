/** @typedef {import('../types').Network} Network */

/** @type {Record<Network, string>} */
export const HORIZON_URLS = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
  futurenet: 'https://horizon-futurenet.stellar.org',
}

/** @type {Record<Network, string>} */
export const SOROBAN_RPC_URLS = {
  mainnet: 'https://mainnet.stellar.validationcloud.io/v1/soroban/rpc',
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

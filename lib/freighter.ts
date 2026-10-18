'use client'

/**
 * Thin wrapper around `@stellar/freighter-api`.
 *
 * Every Freighter call goes through this module so the rest of the app never
 * touches the wallet API directly, and so the two awkward parts of that API are
 * normalised in one place:
 *
 * 1. The extension is reached over `postMessage`, and some requests never settle
 *    when the extension is missing. Every call is time-boxed and a timeout is
 *    reported as "extension unavailable".
 * 2. Errors are returned as an `error` field on the resolved value rather than
 *    thrown, so they are converted into thrown errors here.
 */

import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api'

import type { Network } from '@/types'

export const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/'

export const FREIGHTER_NOT_INSTALLED = 'Freighter not installed — install the extension and reload'
export const FREIGHTER_CONNECTION_REJECTED = 'Connection rejected'

/** Upper bound for a single availability probe against the extension. */
const EXTENSION_TIMEOUT_MS = 2500

/**
 * Upper bound for requests that wait on the user (e.g. approving the connect
 * popup). These must not use the short probe timeout, otherwise a slow user is
 * reported as "not installed".
 */
const USER_ACTION_TIMEOUT_MS = 120_000

export const FREIGHTER_REQUEST_TIMED_OUT = 'Request timed out — approve the request in Freighter and try again'

/** Freighter network ids for the networks the dashboard supports. */
export const FREIGHTER_NETWORK_BY_CHAIN: Record<Network, string> = {
  mainnet: 'PUBLIC',
  testnet: 'TESTNET',
  futurenet: 'FUTURENET',
}

/** The extension is missing, disabled, or not answering. */
export class FreighterUnavailableError extends Error {
  constructor(message = FREIGHTER_NOT_INSTALLED) {
    super(message)
    this.name = 'FreighterUnavailableError'
  }
}

/** The user declined the request, or the wallet refused to sign. */
export class FreighterRejectedError extends Error {
  constructor(message = FREIGHTER_CONNECTION_REJECTED) {
    super(message)
    this.name = 'FreighterRejectedError'
  }
}

/** The extension is reachable but the request did not settle in time. */
export class FreighterTimeoutError extends Error {
  constructor(message = FREIGHTER_REQUEST_TIMED_OUT) {
    super(message)
    this.name = 'FreighterTimeoutError'
  }
}

export interface FreighterSession {
  publicKey: string
  /** Freighter network id, e.g. `"TESTNET"`. */
  network: string
  networkPassphrase: string
}

function withTimeout<T>(
  request: Promise<T>,
  ms: number = EXTENSION_TIMEOUT_MS,
  onTimeout: () => Error = () => new FreighterUnavailableError()
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms)
    request.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

/**
 * The package reports wallet-side failures as an `error` field holding
 * `{ code, message }` rather than as a rejection.
 */
function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message?: unknown }
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

/** Opens the Freighter download page for users without the extension. */
export function openFreighterInstallPage(): void {
  window.open(FREIGHTER_INSTALL_URL, '_blank')
}

/** True when the extension is installed and answering requests. */
export async function isExtensionAvailable(): Promise<boolean> {
  try {
    const { error } = await withTimeout(isConnected())
    return !error
  } catch {
    return false
  }
}

/** Network the wallet is currently on, or null when it cannot be read. */
export async function getWalletNetwork(): Promise<string | null> {
  try {
    const { network, error } = await withTimeout(getNetworkDetails())
    return error || !network ? null : network
  } catch {
    return null
  }
}

/** True when the wallet is on the same network as the given chain. */
export function isNetworkMatch(chain: Network, walletNetwork: string | null): boolean {
  return walletNetwork !== null && walletNetwork === FREIGHTER_NETWORK_BY_CHAIN[chain]
}

async function readNetworkDetails(): Promise<{ network: string; networkPassphrase: string }> {
  const { network, networkPassphrase, error } = await withTimeout(getNetworkDetails())
  if (error || !network) {
    throw new FreighterUnavailableError()
  }
  return { network, networkPassphrase }
}

/**
 * Current wallet state, or null when the extension is not reachable.
 * `publicKey` is null when the extension is installed but locked/not approved.
 */
export async function readFreighterConnection(): Promise<{
  publicKey: string | null
  network: string | null
  networkPassphrase: string | null
} | null> {
  let connected = false
  try {
    const result = await withTimeout(isConnected())
    if (result.error) return null
    connected = result.isConnected
  } catch {
    return null
  }
  if (!connected) return { publicKey: null, network: null, networkPassphrase: null }

  const { address, error } = await withTimeout(getAddress())
  if (error || !address) return { publicKey: null, network: null, networkPassphrase: null }

  try {
    const details = await readNetworkDetails()
    return {
      publicKey: address,
      network: details.network,
      networkPassphrase: details.networkPassphrase,
    }
  } catch {
    return { publicKey: address, network: null, networkPassphrase: null }
  }
}

/** Explicit connect flow — prompts the user to approve this site. */
export async function connectFreighter(): Promise<FreighterSession> {
  if (!(await isExtensionAvailable())) {
    throw new FreighterUnavailableError()
  }

  let address = ''
  try {
    // The user has to approve the popup, so this must not use the short probe
    // timeout — a slow approval is not an unavailable extension.
    const result = await withTimeout(
      requestAccess(),
      USER_ACTION_TIMEOUT_MS,
      () => new FreighterTimeoutError()
    )
    if (result.error) {
      throw new FreighterRejectedError(apiErrorMessage(result.error, FREIGHTER_CONNECTION_REJECTED))
    }
    if (!result.address) {
      throw new FreighterRejectedError()
    }
    address = result.address
  } catch (error) {
    if (
      error instanceof FreighterRejectedError ||
      error instanceof FreighterUnavailableError ||
      error instanceof FreighterTimeoutError
    ) {
      throw error
    }
    throw new FreighterRejectedError(messageOf(error, FREIGHTER_CONNECTION_REJECTED))
  }

  const details = await readNetworkDetails()
  return { publicKey: address, ...details }
}

/** Signs a base64 XDR envelope, returning the signed envelope. */
export async function signWithFreighter(
  transactionXdr: string,
  options: { networkPassphrase: string; address?: string }
): Promise<string> {
  const { signedTxXdr, error } = await withTimeout(signTransaction(transactionXdr, options))
  if (error || !signedTxXdr) {
    throw new FreighterRejectedError(apiErrorMessage(error, 'Transaction signing was declined'))
  }
  return signedTxXdr
}

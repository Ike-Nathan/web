'use client'

/**
 * Wallet state is not owned by any single component. `FreighterConnect` is
 * rendered in the header *and* on the landing page, `WalletStatusBadge` sits
 * next to it, and the new-contract gate reads the connection through a hook.
 * Each of them used to poll `window.freighter` once on mount and keep a private
 * copy of the answer, so disconnecting from one button left the others showing
 * a stale address and a stale "Connected" badge.
 *
 * Every connect/disconnect now funnels through `broadcastWalletChange`, which
 * updates the `localStorage` and `window` mirrors and notifies listeners with a
 * `txwatch:wallet` CustomEvent. `useWalletState` is the React binding for it.
 */

import { FREIGHTER_PUBLIC_KEY } from '@/lib/storageKeys'

export const WALLET_EVENT = 'txwatch:wallet'
export const WALLET_STORAGE_KEY = FREIGHTER_PUBLIC_KEY

export interface WalletChangeDetail {
  publicKey: string | null
}

/**
 * Publish the current wallet state to every other wallet-aware component.
 *
 * Passing `null` clears both mirrors as well as broadcasting, so no consumer is
 * left holding a key that no longer has a live connection behind it.
 */
export function broadcastWalletChange(publicKey: string | null): void {
  if (typeof window === 'undefined') return

  if (publicKey) {
    window.__freighterPublicKey = publicKey
    localStorage.setItem(WALLET_STORAGE_KEY, publicKey)
  } else {
    delete window.__freighterPublicKey
    localStorage.removeItem(WALLET_STORAGE_KEY)
  }

  window.dispatchEvent(
    new CustomEvent<WalletChangeDetail>(WALLET_EVENT, { detail: { publicKey } })
  )
}

/**
 * Subscribe to wallet changes. Returns an unsubscribe function, so it can be
 * returned straight from a `useEffect`.
 */
export function subscribeWallet(
  listener: (publicKey: string | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<WalletChangeDetail>).detail
    listener(detail ? detail.publicKey : null)
  }

  window.addEventListener(WALLET_EVENT, handler)
  return () => window.removeEventListener(WALLET_EVENT, handler)
}

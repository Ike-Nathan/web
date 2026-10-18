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
export const WALLET_CHANNEL_NAME = 'txwatch-wallet'

export interface WalletChangeDetail {
  publicKey: string | null
}

/**
 * Lazily-created cross-tab channel. `BroadcastChannel` is missing in older
 * browsers and in some test environments, so every use is guarded and the bus
 * degrades to same-tab CustomEvents only.
 */
let walletChannel: BroadcastChannel | null = null

function getWalletChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!walletChannel) {
    try {
      walletChannel = new BroadcastChannel(WALLET_CHANNEL_NAME)
    } catch {
      walletChannel = null
    }
  }
  return walletChannel
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

  const channel = getWalletChannel()
  if (channel) {
    try {
      channel.postMessage({ publicKey } satisfies WalletChangeDetail)
    } catch {
      // Channel closed or serialization failed; same-tab listeners still ran.
    }
  }
}

/**
 * Subscribe to wallet changes. Returns an unsubscribe function, so it can be
 * returned straight from a `useEffect`.
 *
 * Listens to the same-tab CustomEvent and, when available, to the cross-tab
 * `BroadcastChannel`. The channel is closed on unsubscribe so a torn-down
 * subscriber does not keep the port (and its message queue) alive.
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

  const channel = getWalletChannel()
  const channelHandler = (event: MessageEvent<WalletChangeDetail>) => {
    const detail = event.data
    listener(detail ? detail.publicKey ?? null : null)
  }

  if (channel) {
    channel.addEventListener('message', channelHandler)
  }

  return () => {
    window.removeEventListener(WALLET_EVENT, handler)
    if (channel) {
      channel.removeEventListener('message', channelHandler)
      try {
        channel.close()
      } catch {
        // Already closed.
      }
      if (walletChannel === channel) walletChannel = null
    }
  }
}

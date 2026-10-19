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
 * notifies listeners with a `txwatch:wallet` CustomEvent. `useWalletState` is
 * the React binding for it.
 *
 * Nothing is persisted: the wallet is the source of truth. The public key is
 * deliberately *not* written to `localStorage` or `window` (it would be a
 * privacy leak with no benefit, since it is never read back). Any value left
 * behind by older builds is removed on startup.
 */

import { FREIGHTER_PUBLIC_KEY } from '@/lib/storageKeys'

export const WALLET_EVENT = 'txwatch:wallet'
export const WALLET_STORAGE_KEY = FREIGHTER_PUBLIC_KEY
export const WALLET_CHANNEL_NAME = 'txwatch-wallet'

interface WalletChangeDetail {
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
 * Best-effort removal of the legacy persisted key. Storage access can throw
 * (Safari private windows, storage disabled by policy, quota errors), so every
 * call is guarded and failures are ignored.
 */
function clearPersistedPublicKey(): void {
  try {
    localStorage.removeItem(WALLET_STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing to clean up.
  }
}

/**
 * Publish the current wallet state to every other wallet-aware component.
 *
 * Passing `null` broadcasts a cleared state, so no consumer is left holding a
 * key that no longer has a live connection behind it. The event is always
 * dispatched, even if storage access throws.
 */
export function broadcastWalletChange(publicKey: string | null): void {
  if (typeof window === 'undefined') return

  // Never persist the key; just make sure no stale copy survives.
  clearPersistedPublicKey()
  try {
    delete window.__freighterPublicKey
  } catch {
    // Ignore — the window mirror is not required for correctness.
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

// Remove any value persisted by older builds as soon as this module loads.
if (typeof window !== 'undefined') {
  clearPersistedPublicKey()
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

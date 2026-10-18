'use client'

import { useCallback, useEffect, useState } from 'react'
import { readFreighterConnection } from '@/lib/freighter'
import { broadcastWalletChange, subscribeWallet } from '@/lib/walletEvents'

export interface WalletState {
  /** Connected public key, or null while disconnected. */
  publicKey: string | null
  /** True once the initial Freighter connection probe has settled. */
  initialized: boolean
  /** Set the wallet state everywhere, including this instance. */
  publish: (publicKey: string | null) => void
}

/**
 * Shared wallet state for every wallet-aware component.
 *
 * On mount it probes the extension once, then follows the `txwatch:wallet`
 * event bus, so connecting or disconnecting from one component updates all of
 * the others without a reload.
 */
export function useWalletState(): WalletState {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const publish = useCallback((next: string | null) => {
    setPublicKey(next)
    broadcastWalletChange(next)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function probe() {
      try {
        const connection = await readFreighterConnection()
        if (!connection.connected || !connection.publicKey || cancelled) return
        publish(connection.publicKey)
      } catch {
        // Extension refused to answer; stay in the disconnected state.
      } finally {
        if (!cancelled) setInitialized(true)
      }
    }

    probe()

    return () => {
      cancelled = true
    }
  }, [publish])

  // `subscribeWallet` returns its own unsubscribe, which is exactly the
  // cleanup this effect needs.
  useEffect(() => subscribeWallet(setPublicKey), [])

  return { publicKey, initialized, publish }
}

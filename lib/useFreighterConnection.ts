'use client'

import { useEffect, useState } from 'react'
import { subscribeWallet } from '@/lib/walletEvents'
import { readFreighterConnection } from '@/lib/freighter'

export function useFreighterConnection() {
  const [isConnected, setIsConnected] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [network, setNetwork] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Initial probe for the first render only. Ongoing changes are published by
  // the app-level WatchWalletChanges watcher (useWalletState/useWalletWatcher)
  // through the wallet event bus, so no per-instance polling is needed here.
  useEffect(() => {
    let cancelled = false

    async function checkConnection() {
      try {
        const connection = await readFreighterConnection()
        if (cancelled) return
        setPublicKey(connection?.publicKey ?? null)
        setNetwork(connection?.network ?? null)
        setIsConnected(Boolean(connection?.publicKey))
      } catch {
        if (!cancelled) setIsConnected(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    checkConnection()

    return () => {
      cancelled = true
    }
  }, [])

  // The probe above only covers this mount; a disconnect made in the header
  // has to re-open the connect button this hook's gate is hiding.
  useEffect(
    () =>
      subscribeWallet((key) => {
        setPublicKey(key)
        setIsConnected(Boolean(key))
        setLoading(false)
      }),
    []
  )

  return { isConnected, publicKey, network, loading }
}

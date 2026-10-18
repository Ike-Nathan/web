'use client'

import { useEffect, useState } from 'react'
import { subscribeWallet } from '@/lib/walletEvents'
import { readFreighterConnection } from '@/lib/freighter'

export function useFreighterConnection() {
  const [isConnected, setIsConnected] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [network, setNetwork] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkConnection() {
      try {
        const connection = await readFreighterConnection()
        if (!mounted) return
        setPublicKey(connection?.publicKey ?? null)
        setNetwork(connection?.network ?? null)
        setIsConnected(Boolean(connection?.publicKey))
      } catch {
        if (mounted) {
          setIsConnected(false)
          setPublicKey(null)
          setNetwork(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    checkConnection()

    const onSync = () => {
      if (!document.hidden) {
        checkConnection()
      }
    }

    const intervalId = setInterval(onSync, 5000)
    window.addEventListener('focus', onSync)
    document.addEventListener('visibilitychange', onSync)

    return () => {
      mounted = false
      clearInterval(intervalId)
      window.removeEventListener('focus', onSync)
      document.removeEventListener('visibilitychange', onSync)
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

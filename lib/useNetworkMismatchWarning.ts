import { useCallback, useEffect, useState } from 'react'
import type { Network } from '@/types'
import { getWalletNetwork, networkMismatchWarning, readFreighterConnection } from '@/lib/freighter'

/**
 * Warns when the connected wallet's network does not match the selected
 * contract network.
 *
 * The check runs on mount, whenever the selected network changes, and whenever
 * the connection state changes (e.g. after connecting from this page), and the
 * warning is cleared when the wallet is no longer reachable.
 */
export function useNetworkMismatchWarning(network: Network, isConnected: boolean) {
  const [networkWarning, setNetworkWarning] = useState<string | null>(null)

  const checkNetworkMismatch = useCallback(async () => {
    const connection = await readFreighterConnection()
    if (!connection.available || !connection.connected) {
      // No extension or no connected wallet: nothing to compare against.
      setNetworkWarning(null)
      return
    }
    try {
      const walletNetwork = await getWalletNetwork()
      setNetworkWarning(networkMismatchWarning(walletNetwork, network))
    } catch {
      // Locked or disconnected wallet: nothing to warn about.
      setNetworkWarning(null)
    }
  }, [network])

  useEffect(() => {
    let active = true

    async function run() {
      const connection = await readFreighterConnection()
      if (!connection.available || !connection.connected) {
        if (active) setNetworkWarning(null)
        return
      }
      try {
        const walletNetwork = await getWalletNetwork()
        if (active) setNetworkWarning(networkMismatchWarning(walletNetwork, network))
      } catch {
        if (active) setNetworkWarning(null)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [network, isConnected])

  const clearNetworkWarning = useCallback(() => setNetworkWarning(null), [])

  return { networkWarning, checkNetworkMismatch, clearNetworkWarning }
}

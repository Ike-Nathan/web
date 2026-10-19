'use client'

import { useEffect, useState } from 'react'
import { subscribeWallet } from '@/lib/walletEvents'
import { readFreighterConnection } from '@/lib/freighter'
import NetworkBadge from '@/components/NetworkBadge'
import { Network } from '@/lib/types'

export type WalletStatus = 'checking' | 'connected' | 'disconnected' | 'unavailable'

/**
 * Maps a raw Freighter network id to the app's `Network`. `PUBLIC` is
 * Freighter's name for mainnet, which is not obvious to new users.
 */
const FREIGHTER_NETWORK_MAP: Record<string, Network> = {
  PUBLIC: Network.MAINNET,
  TESTNET: Network.TESTNET,
  FUTURENET: Network.FUTURENET,
}

function resolveNetwork(id: string | null | undefined): Network | null {
  if (!id) return null
  return FREIGHTER_NETWORK_MAP[id.toUpperCase()] ?? null
}
/**
 * `checking` is the initial state: the extension's answer is unknown until
 * `readFreighterConnection()` settles, and showing "Unavailable" first made
 * the badge flash grey on every navigation.
 */
export type WalletStatus = 'checking' | 'connected' | 'disconnected' | 'unavailable'

export default function WalletStatusBadge() {
  const [status, setStatus] = useState<WalletStatus>('checking')
  const [networkId, setNetworkId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // One probe on mount; afterwards the app-level watcher publishes every
    // connect/disconnect/network change through the wallet event bus.
    // Probe the extension once on mount to learn the current connection.
    readFreighterConnection()
      .then((connection) => {
        if (cancelled) return
        if (!connection) {
          setStatus('unavailable')
          return
        }
        setStatus(connection.publicKey ? 'connected' : 'disconnected')
        setNetworkId(connection.network ?? null)
      })
      .catch(() => {
        // A rejected probe (extension mid-reload, locked wallet, missing
        // permissions) is not an error the user can act on: report
        // "Disconnected" instead of leaving the badge stuck.
        if (!cancelled) setStatus('disconnected')
      })

    const unsubscribe = subscribeWallet((publicKey, network) => {
      setStatus(publicKey ? 'connected' : 'disconnected')
      setNetworkId(network ?? null)
    // The probe above only covers this mount. A connect or disconnect
    // triggered anywhere else in the app arrives on the event bus.
    const unsubscribe = subscribeWallet((publicKey) => {
      setStatus(publicKey ? 'connected' : 'disconnected')
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (status === 'checking') {
    return (
      <div
        role="status"
        aria-label="Checking wallet status"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />
        <span className="text-xs text-zinc-600">Checking…</span>
      </div>
    )
  }

  const statusConfig = {
    checking: { color: 'bg-zinc-500 animate-pulse', label: 'Checking…' },
    connected: { color: 'bg-emerald-500', label: 'Connected' },
    disconnected: { color: 'bg-amber-500', label: 'Disconnected' },
    unavailable: { color: 'bg-zinc-600', label: 'Unavailable' },
  }

  const config = statusConfig[status]

  const network = status === 'connected' ? resolveNetwork(networkId) : null

  return (
    <div className="flex items-center gap-1.5">
      <div
        data-testid="wallet-status-badge"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
        <span className="text-xs text-zinc-400">{config.label}</span>
      </div>
      {status === 'connected' &&
        (network ? (
          <NetworkBadge network={network} />
        ) : networkId ? (
          <span
            title={networkId}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400"
          >
            Custom network
          </span>
        ) : null)}
    </div>
  )
}

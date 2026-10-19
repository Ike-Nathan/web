'use client'

import { useEffect, useState } from 'react'
import { subscribeWallet } from '@/lib/walletEvents'
import { readFreighterConnection } from '@/lib/freighter'

/**
 * `checking` is the initial state: the extension's answer is unknown until
 * `readFreighterConnection()` settles, and showing "Unavailable" first made
 * the badge flash grey on every navigation.
 */
export type WalletStatus = 'checking' | 'connected' | 'disconnected' | 'unavailable'

export default function WalletStatusBadge() {
  const [status, setStatus] = useState<WalletStatus>('checking')

  useEffect(() => {
    let cancelled = false

    // Probe the extension once on mount to learn the current connection.
    readFreighterConnection()
      .then((connection) => {
        if (cancelled) return
        if (!connection) {
          setStatus('unavailable')
          return
        }
        setStatus(connection.publicKey ? 'connected' : 'disconnected')
      })
      .catch(() => {
        // A rejected probe (extension mid-reload, locked wallet, missing
        // permissions) is not an error the user can act on: report
        // "Disconnected" instead of leaving the badge stuck.
        if (!cancelled) setStatus('disconnected')
      })

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

  return (
    <div
      data-testid="wallet-status-badge"
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      <span className="text-xs text-zinc-400">{config.label}</span>
    </div>
  )
}

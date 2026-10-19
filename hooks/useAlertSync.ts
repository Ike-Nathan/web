'use client'

import { useEffect, useState } from 'react'
import { isApiConfigured, startAlertPolling } from '@/lib/alertSource'
import type { AlertPayload, Network } from '@/types'

export interface AlertSyncState {
  /** True while the last sync succeeded. */
  live: boolean
  /** Epoch ms of the last successful sync. */
  lastSync: number | null
  enabled: boolean
  /** Force an immediate poll cycle */
  syncNow: () => void
}

/**
 * Poll tx-watch-core for a contract's alerts while mounted. No-op when
 * NEXT_PUBLIC_API_URL is unset (localStorage-only mode).
 *
 * Alerts are keyed by (contractId, network) so the same contract ID
 * registered on different networks does not mix alert history.
 */
export function useAlertSync(
  contractId: string | undefined,
  network: Network | string | undefined,
  onNew?: (fresh: AlertPayload[]) => void
): AlertSyncState {
  const [state, setState] = useState<Omit<AlertSyncState, 'syncNow'>>({
    live: false,
    lastSync: null,
    enabled: false,
  })
  const [pollTrigger, setPollTrigger] = useState(0)

  const syncNow = () => setPollTrigger(p => p + 1)

  useEffect(() => {
    if (!contractId || !network || !isApiConfigured()) return
    setState((s) => ({ ...s, enabled: true }))
    return startAlertPolling(contractId, network, {
      onSync: (fresh, at) => {
        setState({ live: true, lastSync: at, enabled: true })
        if (fresh.length) onNew?.(fresh)
      },
      onError: () => setState((s) => ({ ...s, live: false })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, network, pollTrigger])

  return { ...state, syncNow }
}

/**
 * Recompute a derived value (e.g. today's alert count) whenever the window
 * regains focus or the local day rolls over at midnight, so the Dashboard
 * stays fresh without a reload.
 */
export function useDailyRefresh(recompute: () => void): void {
  useEffect(() => {
    const onFocus = () => recompute()
    window.addEventListener('focus', onFocus)

    let timer: ReturnType<typeof setTimeout>
    const scheduleMidnight = () => {
      const now = new Date()
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0,
        0
      )
      timer = setTimeout(() => {
        recompute()
        scheduleMidnight()
      }, midnight.getTime() - now.getTime())
    }
    scheduleMidnight()

    return () => {
      window.removeEventListener('focus', onFocus)
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

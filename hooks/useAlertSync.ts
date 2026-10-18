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
  const [state, setState] = useState<AlertSyncState>({
    live: false,
    lastSync: null,
    enabled: false,
  })

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
  }, [contractId, network])

  return state
}

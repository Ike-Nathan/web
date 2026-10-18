'use client'

import { useState, useEffect, useCallback } from 'react'
import { broadcastWalletChange, subscribeWallet } from '@/lib/walletEvents'

declare global {
  interface Window {
    freighter?: {
      isConnected: () => Promise<boolean>
      getPublicKey: () => Promise<string>
      getNetwork: () => Promise<string>
      signTransaction: (
        xdr: string,
        options: { networkPassphrase: string }
      ) => Promise<string>
    }
    /** Last connected public key, mirrored for components that mount later. */
    __freighterPublicKey?: string | null
  }
}
import {
  connectFreighter,
  FreighterUnavailableError,
  openFreighterInstallPage,
  readFreighterConnection,
} from '@/lib/freighter'

export interface FreighterState {
  publicKey: string | null
  network: string | null
  loading: boolean
  error: string | null
}

export function useFreighter() {
  const [state, setState] = useState<FreighterState>({
    publicKey: null,
    network: null,
    loading: false,
    error: null,
  })

  const initialize = useCallback(async () => {
    try {
      const connected = await window.freighter?.isConnected()
      if (connected) {
        const [publicKey, network] = await Promise.all([
          window.freighter!.getPublicKey(),
          window.freighter!.getNetwork(),
        ])
        broadcastWalletChange(publicKey)
        setState({ publicKey, network, loading: false, error: null })
      const connection = await readFreighterConnection()
      if (connection?.publicKey) {
        setState({
          publicKey: connection.publicKey,
          network: connection.network,
          loading: false,
          error: null,
        })
        return
      }
      setState((prev) => ({ ...prev, loading: false }))
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: 'Failed to initialize Freighter' }))
    }
  }, [])

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(
    () =>
      subscribeWallet((publicKey) => {
        setState((prev) => ({ ...prev, publicKey, network: null }))
      }),
    []
  )

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const session = await connectFreighter()
      setState({
        publicKey: session.publicKey,
        network: session.network,
        loading: false,
        error: null,
      })
    } catch (err) {
      if (err instanceof FreighterUnavailableError) {
        openFreighterInstallPage()
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Connection rejected',
      }))
    }
  }, [])

  const disconnect = useCallback(() => {
    broadcastWalletChange(null)
    setState({ publicKey: null, network: null, loading: false, error: null })
  }, [])

  return { ...state, connect, disconnect, initialize }
}

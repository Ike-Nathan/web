'use client'

import { useWalletState } from '@/hooks/useWalletState'

export function useWallet() {
  const { publicKey } = useWalletState()

  return { publicKey, isConnected: Boolean(publicKey) }
}
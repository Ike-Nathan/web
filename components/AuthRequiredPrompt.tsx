'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AUTH_REQUIRED_EVENT } from '@/lib/apiAuth'
import { useToast } from './ToastProvider'

/** Minimum gap between prompts, so parallel 401s don't stack toasts. */
const PROMPT_COOLDOWN_MS = 30000

/** Prompts the user to re-authenticate when tx-watch-core answers 401 (#256). */
export default function AuthRequiredPrompt() {
  const router = useRouter()
  const { showToast } = useToast()
  const lastShown = useRef(0)

  useEffect(() => {
    const onAuthRequired = () => {
      const now = Date.now()
      if (now - lastShown.current < PROMPT_COOLDOWN_MS) return
      lastShown.current = now
      showToast(
        'Authentication required. Enter your API key to continue.',
        'error',
        {
          actionLabel: 'Open Settings',
          onAction: () => router.push('/settings#api-key'),
        }
      )
    }
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
  }, [router, showToast])

  return null
}

'use client'

import { useState } from 'react'
import type { AlertRule, Network } from '@/types'

type TestStatus = 'idle' | 'loading' | 'success' | 'error'

interface WebhookTestButtonProps {
  url: string
  /** The proxy builds the test payload from these (#261). */
  contractId: string
  network: Network
  rule?: AlertRule
  disabled?: boolean
  className?: string
}

/**
 * Reusable test-delivery control for webhook URLs.
 * Mirrors the status UI used on the Add Contract form so the Contract
 * Detail page (Webhook URL card and Edit Details modal) can fire a test
 * without re-creating the contract.
 */
export default function WebhookTestButton({
  url,
  contractId,
  network,
  rule,
  disabled = false,
  className = '',
}: WebhookTestButtonProps) {
  const [status, setStatus] = useState<TestStatus>('idle')
  const [message, setMessage] = useState<string>('')

  const handleTest = async () => {
    if (!url) {
      setStatus('error')
      setMessage('Enter a webhook URL first.')
      return
    }

    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, contractId, network, rule }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      setStatus('success')
      setMessage('Test webhook delivered successfully.')
    } catch (err) {
      setStatus('error')
      setMessage(
        err instanceof Error ? err.message : 'Failed to send test webhook.'
      )
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleTest}
        disabled={disabled || status === 'loading'}
        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'loading' ? 'Sending…' : 'Send test'}
      </button>

      {status === 'success' && (
        <p className="text-sm text-green-600">{message}</p>
      )}
      {status === 'error' && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}

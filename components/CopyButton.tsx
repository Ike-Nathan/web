'use client'

import { useEffect, useRef, useState } from 'react'

type CopyState = 'idle' | 'copied' | 'error'

interface CopyButtonProps {
  text: string
  /** Accessible label for screen readers. Defaults to "Copy to clipboard". */
  'aria-label'?: string
  className?: string
}

/**
 * Copies `text` to the clipboard.
 *
 * Falls back to a hidden textarea + document.execCommand("copy") on
 * non-HTTPS origins where navigator.clipboard is unavailable.
 * Shows an error state when both methods fail.
 * Announces the result via an aria-live region.
 * Clears the success/error timeout on unmount.
 */
export default function CopyButton({
  text,
  'aria-label': ariaLabel = 'Copy to clipboard',
  className = '',
}: CopyButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the pending timeout when the component unmounts
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  async function copy() {
    // Clear any running timer before starting a new copy
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    let success = false

    // Primary: Clipboard API (requires HTTPS / secure context)
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text)
        success = true
      } catch {
        // fall through to legacy method
      }
    }

    // Fallback: hidden textarea + execCommand
    if (!success) {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.cssText = 'position:absolute;left:-9999px;top:-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        success = document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        success = false
      }
    }

    const nextState: CopyState = success ? 'copied' : 'error'
    setCopyState(nextState)
    timeoutRef.current = setTimeout(() => {
      setCopyState('idle')
      timeoutRef.current = null
    }, 1500)
  }

  const liveMessage =
    copyState === 'copied'
      ? 'Copied!'
      : copyState === 'error'
        ? 'Copy failed'
        : ''

  return (
    <>
      {/* aria-live region announces the copy result to screen readers */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </span>

      <button
        type="button"
        onClick={copy}
        aria-label={ariaLabel}
        className={`text-zinc-500 hover:text-zinc-300 transition-colors ${className}`}
      >
        {copyState === 'copied' ? (
          // Success icon
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : copyState === 'error' ? (
          // Error icon
          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          // Idle clipboard icon
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    </>
  )
}
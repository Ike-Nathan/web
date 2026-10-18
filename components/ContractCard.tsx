import Link from 'next/link'
import { useEffect, useReducer, useRef, useState } from 'react'
import { WatchedContract } from '@/types'
import NetworkBadge from './NetworkBadge'
import {
  SYNC_STATUS_EVENT,
  getSyncStatuses,
  retryContractSync,
} from '@/lib/contractSync'
import { truncateId } from '@/lib/stellar'
import { formatDate, formatRelativeTime } from '@/lib/format'
import { useNow } from '@/lib/useNow'

interface ContractCardProps {
  contract: WatchedContract
  lastAlertTime?: number
  highlight?: boolean
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

export default function ContractCard({
  contract,
  lastAlertTime,
  highlight,
  selectable,
  selected,
  onToggleSelect,
}: ContractCardProps) {
  const hasWebhook = Boolean(contract.webhook_url)
  const sync = getSyncStatuses()[contract.id]
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const [retrying, setRetrying] = useState(false)
  const ref = useRef<HTMLAnchorElement>(null)
  const paused = contract.enabled === false
  const now = useNow(60_000)

  useEffect(() => {
    if (!highlight) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlight])

  useEffect(() => {
    window.addEventListener(SYNC_STATUS_EVENT, refresh)
    return () => window.removeEventListener(SYNC_STATUS_EVENT, refresh)
  }, [])

  const handleRetry = async (e: React.MouseEvent) => {
    // The card itself is a link / selection target.
    e.preventDefault()
    e.stopPropagation()
    setRetrying(true)
    await retryContractSync(contract.id)
    setRetrying(false)
  }

  const cardClassName = `block bg-zinc-900 border rounded-xl p-5 transition-all group ${
    selected
      ? 'border-indigo-500 ring-2 ring-indigo-500/40'
      : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/60'
  } ${highlight ? 'ring-2 ring-indigo-500/40 motion-safe:animate-pulse' : ''}`

  const body = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          {selectable && (
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={() => onToggleSelect?.(contract.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${contract.label}`}
              className="mt-1 h-4 w-4 flex-shrink-0 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
            />
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-zinc-100 truncate group-hover:text-white">
              {contract.label}
            </h3>
            <p className="text-xs font-mono text-zinc-500 mt-0.5">
              {truncateId(contract.contract_id)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {paused && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-500/15 text-zinc-400 border border-zinc-500/20">
              Paused
            </span>
          )}
          <NetworkBadge network={contract.network} />
        </div>
        {sync && (
          <span
            className={
              sync.state === 'error'
                ? 'text-xs text-red-400'
                : 'text-xs text-emerald-400'
            }
            title={sync.error}
          >
            {sync.state === 'error' ? 'Sync failed' : 'Synced'}
          </span>
        )}
        {sync?.state === 'error' && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
      </div>

      {/* Webhook status indicator */}
      {!hasWebhook && (
        <div className="mb-3 flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/20">
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>No webhook configured</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          <span className="text-zinc-300 font-medium">
            {contract.rules.length}
          </span>{' '}
          {contract.rules.length === 1 ? 'rule' : 'rules'} active
        </span>
        {lastAlertTime ? (
          <span>
            Last alert{' '}
            <time
              dateTime={new Date(lastAlertTime).toISOString()}
              title={formatDate(lastAlertTime)}
            >
              {formatRelativeTime(lastAlertTime, now)}
            </time>
          </span>
        ) : (
          <span>No alerts yet</span>
        )}
      </div>
    </>
  )

  if (selectable) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggleSelect?.(contract.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleSelect?.(contract.id)
          }
        }}
        className={`${cardClassName} cursor-pointer`}
      >
        {body}
      </div>
    )
  }

  return (
    <Link href={`/contracts/${contract.id}`} className={cardClassName}>
      {body}
    </Link>
  )
}

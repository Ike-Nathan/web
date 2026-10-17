'use client'

import { useState } from 'react'
import { getRetentionDays, setRetentionDays } from '@/lib/storage'
import { ALERTS_KEY } from '@/lib/storageKeys'

export default function RetentionSetting() {
  const [days, setDays] = useState(() => getRetentionDays())
  const [draft, setDraft] = useState(() => String(getRetentionDays()))
  const [pending, setPending] = useState<number | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const countAlertsOlderThan = (retentionDays: number): number => {
    if (typeof window === 'undefined') return 0
    try {
      const raw = window.localStorage.getItem(ALERTS_KEY)
      if (!raw) return 0
      const alerts = JSON.parse(raw)
      if (!Array.isArray(alerts)) return 0
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
      return alerts.filter((alert: unknown) => {
        if (!alert || typeof alert !== 'object') return false
        const timestamp = (alert as { timestamp?: unknown }).timestamp
        if (typeof timestamp === 'number') return timestamp < cutoff
        if (typeof timestamp === 'string') {
          const parsed = Date.parse(timestamp)
          return !Number.isNaN(parsed) && parsed < cutoff
        }
        return false
      }).length
    } catch {
      return 0
    }
  }

  const applyValue = (next: number) => {
    if (!Number.isFinite(next) || next < 1) return
    if (next < days) {
      const count = countAlertsOlderThan(next)
      if (count > 0) {
        setPending(next)
        setPendingCount(count)
        return
      }
    }
    setDays(next)
    setDraft(String(next))
    setRetentionDays(next)
  }

  const handleCommit = () => {
    const next = Number(draft)
    if (!Number.isFinite(next) || next < 1) {
      setDraft(String(days))
      return
    }
    applyValue(next)
  }

  const confirmShrink = () => {
    if (pending === null) return
    setDays(pending)
    setDraft(String(pending))
    setRetentionDays(pending)
    setPending(null)
    setPendingCount(0)
  }

  const cancelShrink = () => {
    setPending(null)
    setPendingCount(0)
    setDraft(String(days))
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Alert retention</h2>
      <label className="block text-sm text-zinc-400" htmlFor="retention-days">
        Keep alerts for (days)
      </label>
      <div className="flex items-center gap-2">
        <input
          id="retention-days"
          type="number"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleCommit()
            }
          }}
          className="w-24 bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
        />
        <button
          type="button"
          onClick={handleCommit}
          className="bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1 text-sm"
        >
          Save
        </button>
      </div>
      {pending !== null && (
        <div className="space-y-2 rounded border border-amber-700 bg-amber-950/40 p-2 text-sm">
          <p className="text-amber-200">
            Reducing retention to {pending} day{pending === 1 ? '' : 's'} will permanently
            delete {pendingCount} alert{pendingCount === 1 ? '' : 's'}.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmShrink}
              className="bg-red-700 hover:bg-red-600 rounded px-3 py-1 text-sm"
            >
              Delete and save
            </button>
            <button
              type="button"
              onClick={cancelShrink}
              className="bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
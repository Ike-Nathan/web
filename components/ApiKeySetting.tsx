'use client'

import { useEffect, useState } from 'react'
import { getApiKey, setApiKey } from '@/lib/apiAuth'

/** API key sent to tx-watch-core as `Authorization: Bearer <key>` (#256). */
export default function ApiKeySetting() {
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(getApiKey() ?? '')
  }, [])

  const handleSave = () => {
    setApiKey(draft.trim() || null)
    setSaved(true)
  }

  return (
    <section id="api-key" className="space-y-4">
      <h2 className="text-lg font-semibold">API Key</h2>
      <p className="text-sm text-zinc-400">
        Sent to tx-watch-core with every request. Kept for this browser session
        only.
      </p>
      <div className="flex flex-wrap gap-3">
        <label htmlFor="api-key-input" className="sr-only">
          API key
        </label>
        <input
          id="api-key-input"
          type="password"
          autoComplete="off"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setSaved(false)
          }}
          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Save key
        </button>
      </div>
      {saved && <p className="text-sm text-zinc-400">Saved.</p>}
    </section>
  )
}

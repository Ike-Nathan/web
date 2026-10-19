'use client'

import { useEffect } from 'react'
import { startSyncRetries } from '@/lib/contractSync'

/** Replays failed contract syncs on load, on reconnect and as backoff elapses (#253). */
export default function SyncRetryRunner() {
  useEffect(() => startSyncRetries(), [])
  return null
}

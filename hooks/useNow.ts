'use client'

import { useEffect, useState } from 'react'

type Subscriber = (now: number) => void

interface SharedTimer {
  intervalMs: number
  timerId: ReturnType<typeof setInterval>
  subscribers: Set<Subscriber>
}

// Module-level registry of shared timers, keyed by interval.
const timers = new Map<number, SharedTimer>()

function subscribe(intervalMs: number, subscriber: Subscriber): () => void {
  let shared = timers.get(intervalMs)

  if (!shared) {
    const subscribers = new Set<Subscriber>()
    const timerId = setInterval(() => {
      const now = Date.now()
      subscribers.forEach((fn) => fn(now))
    }, intervalMs)

    shared = { intervalMs, timerId, subscribers }
    timers.set(intervalMs, shared)
  }

  shared.subscribers.add(subscriber)

  return () => {
    const current = timers.get(intervalMs)
    if (!current) return

    current.subscribers.delete(subscriber)

    if (current.subscribers.size === 0) {
      clearInterval(current.timerId)
      timers.delete(intervalMs)
    }
  }
}

/**
 * Returns the current timestamp, refreshed on a shared interval.
 *
 * All consumers requesting the same `intervalMs` share a single
 * module-level `setInterval`. The timer is created when the first
 * subscriber mounts and cleared when the last one unmounts.
 */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    // Sync immediately in case time passed between render and effect.
    setNow(Date.now())

    const unsubscribe = subscribe(intervalMs, setNow)
    return unsubscribe
  }, [intervalMs])

  return now
}

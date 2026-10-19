import { AlertPayload, Network, WatchedContract } from '@/types'
import { hasActiveWebhooks } from '@/lib/contractsApi'

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface AlertRecord {
  id?: string
  createdAt?: string | Date
  timestamp?: number
  severity?: AlertSeverity
  network?: string
  ruleType?: string
  rule_triggered?: string
}

export interface AlertBucket {
  key: string
  label: string
  start: Date
  end: Date
  total: number
  byGroup: Record<string, number>
}

export interface AlertActivitySeries {
  buckets: AlertBucket[]
  groups: string[]
  total: number
  max: number
}

export type AlertActivityRange = '24h' | '7d'

export type AlertGroupBy = 'network' | 'ruleType'

const HOUR_MS = 60 * 60 * 1000

function toDate(value: string | number | Date): Date {
  if (value instanceof Date) return value
  return new Date(value)
}

function startOfHour(date: Date): Date {
  const d = new Date(date)
  d.setMinutes(0, 0, 0, 0)
  return d
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function groupKey(alert: AlertRecord | AlertPayload, groupBy: AlertGroupBy): string {
  const value =
    groupBy === 'network'
      ? alert.network
      : (alert as { ruleType?: string }).ruleType ?? (alert as AlertPayload).rule_triggered
      : (alert as any).ruleType ?? (alert as AlertPayload).rule_triggered
  return value && value.trim().length > 0 ? value : 'unknown'
}

/**
 * Buckets alerts into calendar-aligned time windows and counts them,
 * optionally split by network or rule type.
 *
 * For 7-day ranges, days are stepped using `setDate(d.getDate() - i)` so
 * boundaries align to local midnight across DST transitions without drifting.
 */
export function bucketAlerts(
  alerts: Array<AlertRecord | AlertPayload>,
  range: AlertActivityRange,
  groupBy: AlertGroupBy = 'network',
  now: Date = new Date()
): AlertActivitySeries {
  const isHourly = range === '24h'
  const bucketCount = isHourly ? 24 : 7
  const buckets: AlertBucket[] = []

  if (isHourly) {
    const anchor = startOfHour(now)
    for (let i = bucketCount - 1; i >= 0; i -= 1) {
      const start = new Date(anchor.getTime() - i * HOUR_MS)
      const end = new Date(start.getTime() + HOUR_MS)
      const label = `${String(start.getHours()).padStart(2, '0')}:00`
      buckets.push({ key: start.toISOString(), label, start, end, total: 0, byGroup: {} })
    }
  } else {
    // Calendar-aligned daily buckets: step with setDate to prevent DST drift
    const today = startOfDay(now)
    for (let i = bucketCount - 1; i >= 0; i -= 1) {
      const start = new Date(today)
      start.setDate(today.getDate() - i)
      const end = new Date(start)
      end.setDate(start.getDate() + 1)
      const label = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      buckets.push({ key: start.toISOString(), label, start, end, total: 0, byGroup: {} })
    }
  }

  const groups = new Set<string>()

  for (const alert of alerts) {
    const time =
      typeof (alert as { timestamp?: unknown }).timestamp === 'number'
        ? ((alert as { timestamp: number }).timestamp)
        : toDate((alert as { createdAt?: string | Date }).createdAt ?? (alert as { timestamp?: string | number | Date }).timestamp ?? 0).getTime()
    if (Number.isNaN(time) || time === 0) continue
      typeof (alert as any).timestamp === 'number'
        ? (alert as any).timestamp
        : toDate((alert as any).createdAt ?? (alert as any).timestamp).getTime()
    if (Number.isNaN(time)) continue

    for (const bucket of buckets) {
      if (time >= bucket.start.getTime() && time < bucket.end.getTime()) {
        const key = groupKey(alert, groupBy)
        groups.add(key)
        bucket.total += 1
        bucket.byGroup[key] = (bucket.byGroup[key] ?? 0) + 1
        break
      }
    }
  }

  const sortedGroups = Array.from(groups).sort()
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0)
  const max = buckets.reduce((peak, bucket) => Math.max(peak, bucket.total), 0)

  return { buckets, groups: sortedGroups, total, max }
}

/**
 * Storage migration helper: backfills `enabled: true` on contracts.
 */
export function migrateWatchedContracts(
  contracts: Array<Partial<WatchedContract> & { id: string }>
): WatchedContract[] {
  return contracts.map((contract) => ({
    ...contract,
    enabled: (contract as { enabled?: boolean }).enabled ?? true,
  })) as WatchedContract[]
}

export function isContractPaused(contract: { enabled?: boolean; paused?: boolean }): boolean {
  return contract.enabled === false || contract.paused === true
}

/**
 * Unifies definition of active webhooks across the application:
 * contract must be enabled and have a non-empty webhook URL.
 */
export function countActiveWebhooks(contracts: WatchedContract[]): number {
  return contracts.filter(hasActiveWebhooks).length
    enabled: (contract as any).enabled ?? true,
  })) as WatchedContract[]
}

export function isContractPaused(contract: { enabled?: boolean }): boolean {
  return contract.enabled === false
}

export function countActiveWebhooks(contracts: Array<{ enabled?: boolean; webhook_url?: string }>): number {
  return contracts.filter((c) => !isContractPaused(c) && Boolean(c.webhook_url)).length
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useContracts } from '@/lib/useContracts'
import { getAlerts, getNetworkDistribution } from '@/lib/storage'
import { hasActiveWebhooks } from '@/lib/contractsApi'
import { getAlerts, getNetworkDistribution, onAlertsChange } from '@/lib/storage'
import ContractCard from '@/components/ContractCard'
import EmptyState from '@/components/EmptyState'
import NetworkBadge from '@/components/NetworkBadge'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import AlertActivityChart from '@/components/AlertActivityChart'
import { getLatestAlertTimestamps } from '@/lib/alertSource'
import { Network, AlertPayload } from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

interface AlertBucket {
  label: string
  count: number
}

function bucketAlerts(alerts: AlertPayload[], now: number, bucketMs: number, bucketCount: number): AlertBucket[] {
  const buckets: AlertBucket[] = []
  for (let i = bucketCount - 1; i >= 0; i--) {
    const start = now - (i + 1) * bucketMs
    const end = now - i * bucketMs
    const count = alerts.filter((a) => a.timestamp > start && a.timestamp <= end).length
    const date = new Date(end)
    const label =
      bucketMs === DAY_MS
        ? date.toLocaleDateString(undefined, { weekday: 'short' })
        : date.toLocaleTimeString(undefined, { hour: 'numeric' })
    buckets.push({ label, count })
  }
  return buckets
}

function AlertActivityChart({ title, buckets }: { title: string; buckets: AlertBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const width = 320
  const height = 100
  const gap = 6
  const barWidth = (width - gap * (buckets.length - 1)) / buckets.length
  const isHourly = buckets.length > 7

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <svg
        role="img"
        aria-label={`${title} bar chart`}
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 w-full h-24"
        preserveAspectRatio="none"
      >
        {buckets.map((bucket, i) => {
          const barHeight = (bucket.count / max) * height
          const x = i * (barWidth + gap)
          const y = height - barHeight
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={2}
              className="fill-indigo-500"
            />
          )
        })}
      </svg>
      {/* HTML axis labels to prevent stretching and overlapping */}
      <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-500 select-none">
        {buckets.map((bucket, i) => {
          let visibility = 'text-center'
          if (isHourly) {
            if (i % 6 !== 0) {
              visibility = i % 3 === 0 ? 'hidden sm:block text-center' : 'hidden lg:block text-center'
            }
          }
          return (
            <span key={i} className={`flex-1 ${visibility}`}>
              {bucket.label}
            </span>
          )
        })}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Alerts</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket, i) => (
            <tr key={i}>
              <th scope="row">{bucket.label}</th>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const DASHBOARD_CARD_LIMIT = 6

export default function DashboardPage() {
  const { contracts } = useContracts()
  const [alertsToday, setAlertsToday] = useState(0)
  const [allAlerts, setAllAlerts] = useState<AlertPayload[]>([])
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState<number>(() => Date.now())

  const refreshAlertsToday = useCallback(() => {
    const collected: AlertPayload[] = []
    for (const contract of contracts) {
      collected.push(...getAlerts(contract.contract_id))
    }
    setAllAlerts(collected)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    setAlertsToday(collected.filter((a) => a.timestamp >= startOfToday.getTime()).length)
    setNow(Date.now())
    setMounted(true)
  }, [contracts])

  const dailyBuckets = useMemo(
    () => bucketAlerts(allAlerts, now, DAY_MS, 7),
    [allAlerts, now]
  )
  const hourlyBuckets = useMemo(
    () => bucketAlerts(allAlerts, now, HOUR_MS, 24),
    [allAlerts, now]
  const latestAlerts = useMemo(
    () => getLatestAlertTimestamps(allAlerts),
    [allAlerts]
  )

  // Update `now` every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  // Update `now` on alert changes
  useEffect(() => {
    return onAlertsChange(() => {
      refreshAlertsToday()
      setNow(Date.now())
    })
  }, [refreshAlertsToday])

  useEffect(() => {
    refreshAlertsToday()
  }, [refreshAlertsToday])

  // Recompute when the window regains focus.
  useEffect(() => {
    window.addEventListener('focus', refreshAlertsToday)
    return () => window.removeEventListener('focus', refreshAlertsToday)
  }, [refreshAlertsToday])

  // Recompute at local midnight so the count rolls over without a reload.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    function scheduleMidnight() {
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(() => {
        refreshAlertsToday()
        scheduleMidnight()
      }, midnight.getTime() - now.getTime())
    }

    scheduleMidnight()
    return () => clearTimeout(timer)
  }, [refreshAlertsToday])

  const activeWebhooks = contracts.filter(hasActiveWebhooks).length
  const networkCounts = contracts.length > 0 ? getNetworkDistribution() : ({} as Record<Network, number>)
  const networkSummary = (['mainnet', 'testnet', 'futurenet'] as Network[])
    .filter((network) => networkCounts[network])
    .map((network) => ({ network, count: networkCounts[network] }))

  if (!mounted) return <DashboardSkeleton />

  // Sort by most recent alert (descending), then by label (ascending).
  const sortedContracts = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const aAlert = latestAlerts[`${a.network}:${a.contract_id}`] ?? latestAlerts[a.contract_id] ?? 0
      const bAlert = latestAlerts[`${b.network}:${b.contract_id}`] ?? latestAlerts[b.contract_id] ?? 0
      if (bAlert !== aAlert) return bAlert - aAlert
      return a.label.localeCompare(b.label)
    })
  }, [contracts, latestAlerts])

  const visibleContracts = sortedContracts.slice(0, DASHBOARD_CARD_LIMIT)
  const hasMoreContracts = sortedContracts.length > DASHBOARD_CARD_LIMIT

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Monitor your Soroban contracts in real time</p>
        </div>
        <Link
          href="/contracts/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Contract
        </Link>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Contracts Watched', value: contracts.length, href: '/contracts' },
          { label: 'Alerts Today', value: alertsToday, href: '/contracts?filter=alerts-today' },
          { label: 'Active Webhooks', value: activeWebhooks, href: '/contracts?filter=webhooks' },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 transition-colors">
            <p className="text-2xl font-bold text-zinc-100">{stat.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
          </Link>
        ))}

        <Link href="/contracts" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 transition-colors">
          <p className="text-2xl font-bold text-zinc-100">{Object.keys(networkCounts).length}</p>
          <p className="text-xs text-zinc-500 mt-1">Networks in use</p>
          <div className="mt-4 space-y-2">
            {networkSummary.length > 0 ? (
              networkSummary.map(({ network, count }) => (
                <div key={network} className="flex items-center justify-between">
                  <NetworkBadge network={network} />
                  <span className="text-xs text-zinc-400">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-600">No networks yet</p>
            )}
          </div>
        </Link>
      </div>

      {/* Alert activity charts */}
      <AlertActivityChart alerts={allAlerts} />

      {/* Contract cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Contracts</h2>
          {hasMoreContracts && (
            <Link href="/contracts" className="text-sm text-indigo-400 hover:text-indigo-300">
              View all {sortedContracts.length}
            </Link>
          )}
        </div>

        {visibleContracts.length === 0 ? (
          <EmptyState
            title="No contracts yet"
            description="Add your first Soroban contract to start monitoring events and alerts."
            action={
              <Link
                href="/contracts/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
              >
                Add Contract
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleContracts.map((c) => (
              <ContractCard
                key={c.id}
                contract={c}
                lastAlertTime={latestAlerts[`${c.network}:${c.contract_id}`] ?? latestAlerts[c.contract_id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

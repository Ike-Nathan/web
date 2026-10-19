'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useContracts } from '@/lib/useContracts'
import { getAlerts, getNetworkDistribution } from '@/lib/storage'
import ContractCard from '@/components/ContractCard'
import EmptyState from '@/components/EmptyState'
import NetworkBadge from '@/components/NetworkBadge'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import AlertActivityChart from '@/components/AlertActivityChart'
import { getLatestAlertTimestamps } from '@/lib/alertSource'
import { Network, AlertPayload } from '@/types'

const DASHBOARD_CARD_LIMIT = 6

export default function DashboardPage() {
  const { contracts } = useContracts()
  const [alertsToday, setAlertsToday] = useState(0)
  const [allAlerts, setAllAlerts] = useState<AlertPayload[]>([])
  const [mounted, setMounted] = useState(false)

  const refreshAlertsToday = useCallback(() => {
    const collected: AlertPayload[] = []
    for (const contract of contracts) {
      collected.push(...getAlerts(contract.contract_id))
    }
    setAllAlerts(collected)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    setAlertsToday(collected.filter((a) => a.timestamp >= startOfToday.getTime()).length)
    setMounted(true)
  }, [contracts])

  const latestAlerts = useMemo(
    () => getLatestAlertTimestamps(allAlerts),
    [allAlerts]
  )

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

  const activeWebhooks = contracts.filter((c) => c.webhook_url).length
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
          { label: 'Alerts Today', value: alertsToday, href: '/contracts?filter=alerts' },
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

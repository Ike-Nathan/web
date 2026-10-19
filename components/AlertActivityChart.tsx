'use client'

import { useMemo, useState } from 'react'
import {
  bucketAlerts as bucketAlertsDashboard,
  AlertBucket,
  AlertGroupBy,
} from '@/lib/dashboard'
import { AlertPayload } from '@/types'

export const SERIES_COLORS = [
  '#10b981', // emerald-500 (mainnet)
  '#eab308', // yellow-500 (testnet)
  '#a855f7', // purple-500 (futurenet)
  '#f59e0b', // amber-500 (LargeTransfer)
  '#6366f1', // indigo-500 (FunctionCalled)
  '#ef4444', // red-500 (AdminFunctionCalled)
  '#f43f5e', // rose-500 (TransactionFailed)
  '#71717a', // zinc-500 (AnyTransaction)
]

const NETWORK_COLORS: Record<string, string> = {
  mainnet: '#10b981',
  testnet: '#eab308',
  futurenet: '#a855f7',
}

const RULE_COLORS: Record<string, string> = {
  AnyTransaction: '#71717a',
  LargeTransfer: '#f59e0b',
  FunctionCalled: '#6366f1',
  AdminFunctionCalled: '#ef4444',
  TransactionFailed: '#f43f5e',
}

export function getSeriesColor(group: string, groupBy: AlertGroupBy = 'network'): string {
  if (groupBy === 'network' && NETWORK_COLORS[group.toLowerCase()]) {
    return NETWORK_COLORS[group.toLowerCase()]
  }
  if (RULE_COLORS[group]) {
    return RULE_COLORS[group]
  }
  if (NETWORK_COLORS[group.toLowerCase()]) {
    return NETWORK_COLORS[group.toLowerCase()]
  }
  return SERIES_COLORS[Math.abs(hashString(group)) % SERIES_COLORS.length]
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export { bucketAlertsDashboard as bucketAlerts }

interface ChartSectionProps {
  title: string
  buckets: AlertBucket[]
  groups: string[]
  formatLabel: (d: Date) => string
  isHourly?: boolean
}

export function ActivityChartSection({
  title,
  buckets,
  groups,
  formatLabel,
  isHourly = false,
}: ChartSectionProps) {
  const max = Math.max(1, ...buckets.map((b) => b.total))
  const width = 360
  const height = 120
  const padding = { top: 10, right: 10, bottom: 8, left: 10 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const slot = plotWidth / Math.max(1, buckets.length)
  const barWidth = Math.max(3, slot * 0.65)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        </div>

        {/* SVG only draws the visual bars and axis line, without text labels to avoid distortion */}
        <svg
          role="img"
          aria-label={`${title} bar chart`}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-28"
          preserveAspectRatio="none"
        >
          <line
            x1={padding.left}
            y1={padding.top + plotHeight}
            x2={width - padding.right}
            y2={padding.top + plotHeight}
            stroke="#3f3f46"
            strokeWidth={1}
          />
          {buckets.map((bucket, i) => {
            const x = padding.left + i * slot + (slot - barWidth) / 2
            let stackY = padding.top + plotHeight

            return (
              <g key={bucket.key}>
                {groups.map((group) => {
                  const count = bucket.byGroup[group] ?? 0
                  if (count === 0) return null
                  const barHeight = (count / max) * plotHeight
                  stackY -= barHeight

                  return (
                    <rect
                      key={group}
                      x={x}
                      y={stackY}
                      width={barWidth}
                      height={barHeight}
                      rx={1}
                      fill={getSeriesColor(group)}
                    >
                      <title>{`${group}: ${count} alerts`}</title>
                    </rect>
                  )
                })}
              </g>
            )
          })}
        </svg>

        {/* Responsive HTML axis labels to prevent squashing/stretching and overlapping */}
        <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500 select-none">
          {buckets.map((bucket, i) => {
            const label = formatLabel(bucket.start)
            let visibility = 'text-center'
            if (isHourly) {
              // On mobile, show every 6th label (e.g. 00:00, 06:00, 12:00, 18:00)
              // On tablet, show every 3rd label
              // On desktop, show all
              if (i % 6 !== 0) {
                visibility = i % 3 === 0 ? 'hidden sm:block text-center' : 'hidden lg:block text-center'
              }
            }
            return (
              <span key={bucket.key} className={`flex-1 ${visibility}`}>
                {label}
              </span>
            )
          })}
        </div>
      </div>

      {groups.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs border-t border-zinc-800/80 pt-3">
          {groups.map((group) => (
            <span key={group} className="inline-flex items-center gap-1.5 text-zinc-400">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block"
                style={{ backgroundColor: getSeriesColor(group) }}
              />
              {group}
            </span>
          ))}
        </div>
      )}

      <table className="sr-only">
        <caption>{title} data table</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {groups.map((g) => (
              <th key={g} scope="col">
                {g}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <th scope="row">{formatLabel(b.start)}</th>
              {groups.map((g) => (
                <td key={g}>{b.byGroup[g] ?? 0}</td>
              ))}
              <td>{b.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface AlertActivityChartProps {
  alerts?: AlertPayload[]
  title?: string
  buckets?: AlertBucket[]
  now?: Date
}

export default function AlertActivityChart(props: AlertActivityChartProps) {
  const [groupBy, setGroupBy] = useState<AlertGroupBy>('network')
  const anchor = props.now ?? new Date()

  const alerts = props.alerts ?? []

  const daily = useMemo(
    () => bucketAlertsDashboard(alerts, '7d', groupBy, anchor),
    [alerts, groupBy, anchor]
  )

  const hourly = useMemo(
    () => bucketAlertsDashboard(alerts, '24h', groupBy, anchor),
    [alerts, groupBy, anchor]
  )

  // If passed legacy { title, buckets } props directly
  if (props.buckets && props.title) {
    return (
      <ActivityChartSection
        title={props.title}
        buckets={props.buckets}
        groups={[]}
        formatLabel={(d) => d.toLocaleDateString(undefined, { weekday: 'short' })}
        isHourly={props.title.includes('24')}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Group By Toggle Button */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-zinc-500">Group by:</span>
        <button
          type="button"
          onClick={() => setGroupBy('network')}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            groupBy === 'network'
              ? 'bg-zinc-800 text-zinc-100 font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Network
        </button>
        <button
          type="button"
          onClick={() => setGroupBy('ruleType')}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            groupBy === 'ruleType'
              ? 'bg-zinc-800 text-zinc-100 font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Rule Type
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityChartSection
          title="Alerts (last 7 days)"
          buckets={daily.buckets}
          groups={daily.groups}
          formatLabel={(d) => d.toLocaleDateString(undefined, { weekday: 'short' })}
        />
        <ActivityChartSection
          title="Alerts (last 24 hours)"
          buckets={hourly.buckets}
          groups={hourly.groups}
          formatLabel={(d) => `${String(d.getHours()).padStart(2, '0')}:00`}
          isHourly
        />
      </div>
    </div>
  )
}

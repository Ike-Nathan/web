'use client'

import { useMemo, useState } from 'react'
import {
  bucketAlerts,
  AlertBucket,
  AlertGroupBy,
} from '@/lib/dashboard'
import { AlertPayload } from '@/types'

const SERIES_COLORS = [
  '#6366f1', // indigo-500
  '#ec4899', // pink-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // purple-500
  '#06b6d4', // cyan-500
]

interface ChartSectionProps {
  title: string
  buckets: AlertBucket[]
  groups: string[]
  formatLabel: (d: Date) => string
}

function ActivityChartSection({
  title,
  buckets,
  groups,
  formatLabel,
}: ChartSectionProps) {
  const max = Math.max(1, ...buckets.map((b) => b.total))
  const width = 360
  const height = 140
  const padding = { top: 10, right: 10, bottom: 24, left: 10 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const slot = plotWidth / Math.max(1, buckets.length)
  const barWidth = Math.max(3, slot * 0.65)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      </div>

      <svg
        role="img"
        aria-label={`${title} bar chart`}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-32"
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
              {groups.map((group, s) => {
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
                    fill={SERIES_COLORS[s % SERIES_COLORS.length]}
                  >
                    <title>{`${group}: ${count} alerts`}</title>
                  </rect>
                )
              })}
              <text
                x={x + barWidth / 2}
                y={height - 6}
                textAnchor="middle"
                className="fill-zinc-500"
                fontSize={9}
              >
                {formatLabel(bucket.start)}
              </text>
            </g>
          )
        })}
      </svg>

      {groups.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {groups.map((group, s) => (
            <span key={group} className="inline-flex items-center gap-1.5 text-zinc-400">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block"
                style={{ backgroundColor: SERIES_COLORS[s % SERIES_COLORS.length] }}
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
  alerts: AlertPayload[]
  now?: Date
}

export default function AlertActivityChart({ alerts, now }: AlertActivityChartProps) {
  const [groupBy, setGroupBy] = useState<AlertGroupBy>('network')
  const anchor = now ?? new Date()

  const daily = useMemo(
    () => bucketAlerts(alerts, '7d', groupBy, anchor),
    [alerts, groupBy, anchor]
  )

  const hourly = useMemo(
    () => bucketAlerts(alerts, '24h', groupBy, anchor),
    [alerts, groupBy, anchor]
  )

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
          formatLabel={(d) => d.toLocaleTimeString(undefined, { hour: 'numeric' })}
        />
      </div>
    </div>
  )
}

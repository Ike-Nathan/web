'use client'
import { getRuleMeta } from '@/lib/ruleMeta'
import { AlertRuleType } from '@/types'
import { useId, useState } from 'react'

export default function AlertRuleBadge({
  type,
}: {
  type: AlertRuleType | string
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipId = useId()
  const { label, description, style } = getRuleMeta(type)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        data-testid="alert-rule-badge"
        aria-describedby={showTooltip ? tooltipId : undefined}
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${style}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        onClick={() => setShowTooltip((prev) => !prev)}
      >
        {label}
      </button>
      {showTooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 whitespace-nowrap z-10 pointer-events-none"
        >
          {description}
        </div>
      )}
    </div>
  )
}

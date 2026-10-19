'use client'
import { getRuleMeta } from '@/lib/ruleMeta'
import { AlertRuleType } from '@/types'
import { useId, useState } from 'react'

import { AlertRuleType, isAlertRuleType } from '@/types'
import { useId, useState } from 'react'

const styles: Record<AlertRuleType, string> = {
  LargeTransfer: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  AdminFunctionCalled: 'bg-red-500/20 text-red-400 border-red-500/30',
  AnyTransaction: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  FunctionCalled: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  TransactionFailed: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
}

const labels: Record<AlertRuleType, string> = {
  LargeTransfer: 'Large Transfer',
  AdminFunctionCalled: 'Admin Function',
  AnyTransaction: 'Any Transaction',
  FunctionCalled: 'Function Called',
  TransactionFailed: 'Tx Failed',
}

const descriptions: Record<AlertRuleType, string> = {
  LargeTransfer: 'Alert when a transfer is at or above the specified XLM threshold',
  AdminFunctionCalled: 'Alert when admin-level functions are invoked',
  AnyTransaction: 'Alert on any transaction involving this contract',
  FunctionCalled: 'Alert when specific functions are called',
  TransactionFailed: 'Alert when a transaction fails',
}

export default function AlertRuleBadge({
  type,
}: {
  type: AlertRuleType | string
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipId = useId()
  const { label, description, style } = getRuleMeta(type)

  const known = isAlertRuleType(type)
  const style = known ? styles[type] : UNKNOWN_STYLE
  const label = known ? labels[type] : type || 'Unknown'
  const description = known ? descriptions[type] : `Unknown rule type: ${type || '(empty)'}`

  return (
    <div className="relative inline-block">
      <button
        type="button"
        data-testid="alert-rule-badge"
        aria-describedby={showTooltip ? tooltipId : undefined}
        aria-describedby={showTooltip ? tooltipId : undefined}
        aria-label={label}
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

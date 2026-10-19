import { AlertRule } from '@/types'

/**
 * Shared formatting helpers for dates used across the app.
 * For ID truncation use truncateId() from @/lib/stellar.
 */

// ---------------------------------------------------------------------------
// Cached Intl.DateTimeFormat instances — avoids creating a new formatter on
// every render call, which is measurably expensive when lists are long.
// ---------------------------------------------------------------------------

/**
 * Date-only formatter (e.g. "May 29, 2026").
 * No timezone suffix — just the calendar date in the user's locale.
 */
const _dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

/**
 * Date + time formatter with short timezone name (e.g. "May 29, 2026, 3:04 PM UTC").
 * The `timeZoneName: 'short'` makes the UTC offset / abbreviation visible so
 * timestamps can be compared directly with on-chain UTC times.
 */
const _dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

/**
 * Time-only formatter with short timezone name (e.g. "3:04 PM UTC").
 * Useful for rows where the date is already shown in context.
 */
const _timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

/** Formats a Unix ms timestamp as a locale date string (e.g. "May 29, 2026"). */
export function formatDate(timestamp: number): string {
  return _dateFormatter.format(new Date(timestamp))
}

/**
 * Formats a Unix ms timestamp as a locale date + time string with short
 * timezone name (e.g. "May 29, 2026, 3:04 PM UTC").
 */
export function formatDateTime(timestamp: number): string {
  return _dateTimeFormatter.format(new Date(timestamp))
}

/**
 * Formats a Unix ms timestamp as a time-only string with short timezone
 * name (e.g. "3:04 PM UTC").  Use this when the date is already shown
 * in a surrounding context (table row, tooltip, etc.).
 */
export function formatTime(timestamp: number): string {
  return _timeFormatter.format(new Date(timestamp))
}

/**
 * Cached relative-time formatter (e.g. "3 minutes ago").
 * Shared across calls — constructing an Intl.RelativeTimeFormat is expensive
 * and formatRelativeTime is called for every row/card on each refresh tick.
 */
const _relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'auto',
})

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
]

/**
 * Formats a Unix ms timestamp as a relative time string (e.g. "3 minutes ago").
 * Uses Intl.RelativeTimeFormat for locale-aware output.
 */
export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now()
): string {
  const diff = timestamp - now
  const absDiff = Math.abs(diff)

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (absDiff >= ms || unit === 'second') {
      return _relativeTimeFormatter.format(Math.round(diff / ms), unit)
    }
  }

  return _relativeTimeFormatter.format(0, 'second')
}

/**
 * Formats an alert rule as a human-readable summary string.
 *
 * The LargeTransfer operator matches tx-watch-core, which fires when a
 * transfer strictly exceeds the threshold (amount > threshold_xlm).
 */
export function formatRuleSummary(rule: AlertRule): string {
  switch (rule.type) {
    case 'LargeTransfer':
      return `> ${rule.threshold_xlm.toLocaleString()} XLM`
    case 'FunctionCalled':
      return rule.function_name || 'function'
    case 'AdminFunctionCalled':
      return rule.function_names.join(', ') || 'admin functions'
    case 'AnyTransaction':
    case 'TransactionFailed':
      return ''
  }
}

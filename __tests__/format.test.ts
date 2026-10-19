/**
 * Tests for lib/format date and masking helpers.
 */
process.env.TZ = 'UTC'

import { describe, expect, it, vi } from 'vitest'
import { formatDate, formatDateTime, formatTime, formatRelativeTime, maskWebhookUrl } from '../lib/format'

const TS = new Date('2026-05-29T15:04:00Z').getTime()

describe('formatDate', () => {
  it('returns a human-readable date without a time component', () => {
    const result = formatDate(TS)
    expect(result).toMatch(/2026/)
    expect(result).toMatch(/29/)
    expect(result).not.toMatch(/15:04/)
  })

  it('does not include a timezone abbreviation', () => {
    const result = formatDate(TS)
    expect(result).not.toMatch(/UTC|GMT/)
  })
})

describe('formatDateTime', () => {
  it('includes the year, day, hour, and minute', () => {
    const result = formatDateTime(TS)
    expect(result).toMatch(/2026/)
    expect(result).toMatch(/29/)
    expect(result).toMatch(/\d{1,2}[:.]\d{2}/)
  })

  it('includes a short timezone name', () => {
    const result = formatDateTime(TS)
    expect(result).toMatch(/UTC|GMT/)
  })
})

describe('formatTime', () => {
  it('does not include the date', () => {
    const result = formatTime(TS)
    expect(result).not.toMatch(/2026/)
    expect(result).not.toMatch(/May/)
  })

  it('includes a time component', () => {
    const result = formatTime(TS)
    expect(result).toMatch(/\d{1,2}[:.]\d{2}/)
  })

  it('includes a short timezone name', () => {
    const result = formatTime(TS)
    expect(result).toMatch(/UTC|GMT/)
  })
})

describe('formatRelativeTime', () => {
  it('formats past and future offsets correctly', () => {
    const now = TS
    expect(formatRelativeTime(now - 5 * 60_000, now)).toMatch(/5 minutes ago/)
    expect(formatRelativeTime(now - 2 * 3_600_000, now)).toMatch(/2 hours ago/)
    expect(formatRelativeTime(now + 3 * 86_400_000, now)).toMatch(/in 3 days/)
  })

  it('reuses a single cached RelativeTimeFormat instance across calls', () => {
    const now = TS
    formatRelativeTime(now - 60_000, now)

    const spy = vi.spyOn(Intl, 'RelativeTimeFormat')
    try {
      formatRelativeTime(now - 60_000, now)
      formatRelativeTime(now - 120_000, now)
      formatRelativeTime(now + 3_600_000, now)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('maskWebhookUrl', () => {
  it('masks Slack webhook URLs, leaving only the service path', () => {
    expect(maskWebhookUrl('https://hooks.slack.com/services/T00/B00/XXXX')).toBe('https://hooks.slack.com/services/…/****')
  })

  it('masks Discord webhook URLs, leaving only the api path', () => {
    expect(maskWebhookUrl('https://discord.com/api/webhooks/123/abc')).toBe('https://discord.com/api/…/****')
  })

  it('masks URLs with query string tokens', () => {
    expect(maskWebhookUrl('https://example.com/hooks/my-hook?token=secret')).toBe('https://example.com/hooks/…/****')
  })

  it('returns empty string for empty input', () => {
    expect(maskWebhookUrl('')).toBe('')
  })

  it('masks unparseable strings gracefully', () => {
    expect(maskWebhookUrl('not-a-url-secret-string')).toBe('not-a-ur…****')
  })
})
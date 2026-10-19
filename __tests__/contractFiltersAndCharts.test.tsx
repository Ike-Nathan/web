import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  hasAlertSinceLocalMidnight,
  hasActiveWebhooks,
  isActiveWebhook,
  applyContractFilter,
} from '@/lib/contractsApi'
import { countActiveWebhooks } from '@/lib/dashboard'
import AlertActivityChart, { SERIES_COLORS, getSeriesColor } from '@/components/AlertActivityChart'
import { WatchedContract, AlertPayload } from '@/types'
import * as storage from '@/lib/storage'

vi.mock('@/lib/storage', () => ({
  getAlerts: vi.fn(),
  getContracts: vi.fn(),
  getNetworkDistribution: vi.fn(() => ({})),
}))

describe('Contract Filters & Active Webhooks (#228, #227)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleContract: WatchedContract = {
    id: 'c-1',
    contract_id: 'CA1234567890',
    network: 'testnet',
    label: 'Test Contract 1',
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
  }

  describe('hasAlertSinceLocalMidnight', () => {
    it('returns true when contract has stored alert on or after local midnight', () => {
      const now = new Date('2026-10-19T14:00:00Z')
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const mockAlert: AlertPayload = {
        contract_id: 'CA1234567890',
        timestamp: midnight + 3600 * 1000,
        rule_triggered: 'LargeTransfer',
        transaction_hash: 'tx123',
      }
      vi.mocked(storage.getAlerts).mockReturnValue([mockAlert])

      expect(hasAlertSinceLocalMidnight(sampleContract, now)).toBe(true)
    })

    it('returns false when stored alerts are prior to local midnight', () => {
      const now = new Date('2026-10-19T14:00:00Z')
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const oldAlert: AlertPayload = {
        contract_id: 'CA1234567890',
        timestamp: midnight - 1000,
        rule_triggered: 'LargeTransfer',
        transaction_hash: 'tx000',
      }
      vi.mocked(storage.getAlerts).mockReturnValue([oldAlert])

      expect(hasAlertSinceLocalMidnight(sampleContract, now)).toBe(false)
    })

    it('falls back to lastAlertAt if getAlerts returns empty', () => {
      vi.mocked(storage.getAlerts).mockReturnValue([])
      const now = new Date('2026-10-19T14:00:00Z')
      const contractWithLastAlert: WatchedContract = {
        ...sampleContract,
        lastAlertAt: '2026-10-19T10:00:00Z',
      } as any

      expect(hasAlertSinceLocalMidnight(contractWithLastAlert, now)).toBe(true)
    })

    it('returns false when contract has no alerts and no lastAlertAt', () => {
      vi.mocked(storage.getAlerts).mockReturnValue([])
      const now = new Date('2026-10-19T14:00:00Z')

      expect(hasAlertSinceLocalMidnight(sampleContract, now)).toBe(false)
    })
  })

  describe('hasActiveWebhooks & countActiveWebhooks', () => {
    it('returns true only when contract has webhook_url and is not paused/disabled', () => {
      expect(hasActiveWebhooks({ ...sampleContract, webhook_url: 'https://example.com/hook', enabled: true })).toBe(true)
      expect(isActiveWebhook({ ...sampleContract, webhook_url: 'https://example.com/hook', enabled: true })).toBe(true)

      // Disabled / paused contracts are not active
      expect(hasActiveWebhooks({ ...sampleContract, webhook_url: 'https://example.com/hook', enabled: false })).toBe(false)
      expect(hasActiveWebhooks({ ...sampleContract, webhook_url: 'https://example.com/hook', paused: true } as any)).toBe(false)

      // Contracts without webhook_url are not active
      expect(hasActiveWebhooks({ ...sampleContract, webhook_url: undefined, enabled: true })).toBe(false)
      expect(hasActiveWebhooks({ ...sampleContract, webhook_url: '', enabled: true })).toBe(false)
    })

    it('countActiveWebhooks unifies count with hasActiveWebhooks', () => {
      const contracts: WatchedContract[] = [
        { ...sampleContract, id: '1', webhook_url: 'https://hook1.com', enabled: true },
        { ...sampleContract, id: '2', webhook_url: 'https://hook2.com', enabled: false },
        { ...sampleContract, id: '3', webhook_url: undefined, enabled: true },
        { ...sampleContract, id: '4', webhook_url: 'https://hook4.com', enabled: true },
      ]

      expect(countActiveWebhooks(contracts)).toBe(2)
    })
  })

  describe('applyContractFilter', () => {
    it('applies alerts-today filter correctly', () => {
      const now = new Date('2026-10-19T14:00:00Z')
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

      const c1 = { ...sampleContract, id: '1', contract_id: 'C1' }
      const c2 = { ...sampleContract, id: '2', contract_id: 'C2' }

      vi.mocked(storage.getAlerts).mockImplementation((cid) => {
        if (cid === 'C1') return [{ contract_id: 'C1', timestamp: midnight + 1000, rule_triggered: 'LargeTransfer', transaction_hash: 'h1' }]
        return []
      })

      const res = applyContractFilter([c1, c2], 'alerts-today', now)
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('1')
    })

    it('applies webhooks filter correctly', () => {
      const c1 = { ...sampleContract, id: '1', webhook_url: 'https://hook1.com', enabled: true }
      const c2 = { ...sampleContract, id: '2', webhook_url: 'https://hook2.com', enabled: false }
      const c3 = { ...sampleContract, id: '3', webhook_url: undefined, enabled: true }

      const res = applyContractFilter([c1, c2, c3], 'webhooks')
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('1')
    })

    it('returns unfiltered contracts when filter is null', () => {
      const c1 = { ...sampleContract, id: '1' }
      const c2 = { ...sampleContract, id: '2' }
      expect(applyContractFilter([c1, c2], null)).toHaveLength(2)
    })
  })
})

describe('Chart Colours & Label Rendering (#226, #225)', () => {
  it('uses network dot colors for network series', () => {
    expect(getSeriesColor('mainnet', 'network')).toBe('#10b981')
    expect(getSeriesColor('testnet', 'network')).toBe('#eab308')
    expect(getSeriesColor('futurenet', 'network')).toBe('#a855f7')
  })

  it('uses RULE_META colors for rule series', () => {
    expect(getSeriesColor('LargeTransfer', 'ruleType')).toBe('#f59e0b')
    expect(getSeriesColor('FunctionCalled', 'ruleType')).toBe('#6366f1')
    expect(getSeriesColor('AdminFunctionCalled', 'ruleType')).toBe('#ef4444')
    expect(getSeriesColor('TransactionFailed', 'ruleType')).toBe('#f43f5e')
    expect(getSeriesColor('AnyTransaction', 'ruleType')).toBe('#71717a')
  })

  it('renders labels in HTML below SVG and omits text elements from SVG', () => {
    const alert: AlertPayload = {
      contract_id: 'CA1',
      network: 'testnet',
      rule_triggered: 'LargeTransfer',
      timestamp: Date.now(),
      transaction_hash: 'tx1',
    }

    render(<AlertActivityChart alerts={[alert]} />)

    const svg = screen.getAllByRole('img', { name: /bar chart/i })[0]
    expect(svg.querySelectorAll('text')).toHaveLength(0)
    expect(screen.getByText('Alerts (last 7 days)')).toBeInTheDocument()
    expect(screen.getByText('Alerts (last 24 hours)')).toBeInTheDocument()
  })
})

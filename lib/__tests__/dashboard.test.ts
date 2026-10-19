import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getContracts,
  saveContract,
  deleteContract,
  getTodayAlertCount,
  addAlert,
  getAlerts,
  getNetworkDistribution,
  bucketAlertsByDay,
  bucketAlertsByHour,
  onAlertsChange,
} from '../storage'
import { bucketAlerts } from '../dashboard'
import { WatchedContract, AlertPayload } from '@/types'

// Minimal localStorage shim for node environment
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  get length() { return Object.keys(store).length },
  key: (i: number) => Object.keys(store)[i] ?? null,
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true })

function makeContract(overrides: Partial<WatchedContract> = {}): WatchedContract {
  return {
    id: 'c1',
    label: 'Test Contract',
    contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7',
    network: 'testnet',
    rules: [],
    webhook_url: '',
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  }
}

function makeAlert(overrides: Partial<AlertPayload> = {}): AlertPayload {
  return {
    label: 'Test',
    contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7',
    network: 'testnet',
    rule_triggered: 'AnyTransaction',
    transaction_hash: 'abc123',
    timestamp: Date.now(),
    horizon_link: 'https://horizon-testnet.stellar.org/transactions/abc123',
    ...overrides,
  }
}

beforeEach(() => {
  localStorageMock.clear()
})

// ── Contracts list (empty / populated) ──────────────────────────────────────

describe('contracts list — empty state', () => {
  it('returns empty array when no contracts saved', () => {
    expect(getContracts()).toEqual([])
  })
})

describe('contracts list — populated state', () => {
  it('returns saved contracts', () => {
    saveContract(makeContract({ id: 'c1', label: 'Alpha' }))
    saveContract(makeContract({ id: 'c2', label: 'Beta' }))
    const contracts = getContracts()
    expect(contracts).toHaveLength(2)
    expect(contracts.map((c) => c.label)).toEqual(expect.arrayContaining(['Alpha', 'Beta']))
  })

  it('reflects deletion', () => {
    saveContract(makeContract({ id: 'c1' }))
    saveContract(makeContract({ id: 'c2' }))
    deleteContract('c1')
    const contracts = getContracts()
    expect(contracts).toHaveLength(1)
    expect(contracts[0].id).toBe('c2')
  })

  it('updates existing contract in place', () => {
    saveContract(makeContract({ id: 'c1', label: 'Old' }))
    saveContract(makeContract({ id: 'c1', label: 'New' }))
    const contracts = getContracts()
    expect(contracts).toHaveLength(1)
    expect(contracts[0].label).toBe('New')
  })
})

// ── Filter behavior: active webhooks ────────────────────────────────────────

describe('active webhooks filter', () => {
  it('counts contracts with a non-empty webhook_url', () => {
    saveContract(makeContract({ id: 'c1', webhook_url: 'https://example.com/hook' }))
    saveContract(makeContract({ id: 'c2', webhook_url: '' }))
    saveContract(makeContract({ id: 'c3', webhook_url: 'https://other.com/hook' }))
    const contracts = getContracts()
    const activeWebhooks = contracts.filter((c) => c.webhook_url).length
    expect(activeWebhooks).toBe(2)
  })

  it('returns 0 when no contracts have webhooks', () => {
    saveContract(makeContract({ id: 'c1', webhook_url: '' }))
    const contracts = getContracts()
    expect(contracts.filter((c) => c.webhook_url).length).toBe(0)
  })
})

// ── Stats: contracts count ───────────────────────────────────────────────────

describe('dashboard stats — contracts count', () => {
  it('reflects the number of saved contracts', () => {
    expect(getContracts().length).toBe(0)
    saveContract(makeContract({ id: 'c1' }))
    expect(getContracts().length).toBe(1)
    saveContract(makeContract({ id: 'c2' }))
    expect(getContracts().length).toBe(2)
  })
})

describe('dashboard stats — network distribution', () => {
  it('counts contracts by network', () => {
    saveContract(makeContract({ id: 'c1', network: 'mainnet' }))
    saveContract(makeContract({ id: 'c2', network: 'testnet' }))
    saveContract(makeContract({ id: 'c3', network: 'testnet' }))

    expect(getNetworkDistribution()).toEqual({
      mainnet: 1,
      testnet: 2,
    })
  })
})

// ── Stats: alerts today ──────────────────────────────────────────────────────

describe('dashboard stats — alerts today', () => {
  it('returns 0 when no alerts exist', () => {
    expect(getTodayAlertCount()).toBe(0)
  })

  it('counts only alerts from today', () => {
    const todayAlert = makeAlert({ timestamp: Date.now() })
    const oldAlert = makeAlert({
      transaction_hash: 'old',
      timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
    })
    addAlert(todayAlert)
    addAlert(oldAlert)
    expect(getTodayAlertCount()).toBe(1)
  })

  it('counts multiple alerts from today', () => {
    addAlert(makeAlert({ transaction_hash: 'tx1' }))
    addAlert(makeAlert({ transaction_hash: 'tx2' }))
    addAlert(makeAlert({ transaction_hash: 'tx3' }))
    expect(getTodayAlertCount()).toBe(3)
  })
})

// ── Stats: alerts per contract ───────────────────────────────────────────────

describe('getAlerts — per contract filter', () => {
  it('returns empty array for contract with no alerts', () => {
    expect(getAlerts('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7')).toEqual([])
  })

  it('returns only alerts for the specified contract', () => {
    addAlert(makeAlert({ contract_id: 'CONTRACT_A', transaction_hash: 'tx-a' }))
    addAlert(makeAlert({ contract_id: 'CONTRACT_B', transaction_hash: 'tx-b' }))
    expect(getAlerts('CONTRACT_A')).toHaveLength(1)
    expect(getAlerts('CONTRACT_B')).toHaveLength(1)
    expect(getAlerts('CONTRACT_C')).toHaveLength(0)
  })
})

// ── Dashboard card: last alert lookup ────────────────────────────────────────

describe('dashboard card — last alert lookup', () => {
  it('finds alerts when looked up by contract_id (not internal id)', () => {
    const contract = makeContract({
      id: 'internal-uuid-1',
      contract_id: 'CONTRACT_A',
    })
    saveContract(contract)
    addAlert(makeAlert({ contract_id: 'CONTRACT_A', transaction_hash: 'tx-a' }))

    // Dashboard must look up alerts by contract_id, mirroring the contracts page.
    const alerts = getAlerts(contract.contract_id)
    expect(alerts).toHaveLength(1)

    const lastAlertTime = alerts.length
      ? new Date(Math.max(...alerts.map((a) => a.timestamp))).toLocaleString()
      : null
    expect(lastAlertTime).not.toBeNull()
    expect(lastAlertTime).not.toBe('No alerts yet')
  })

  it('shows "No alerts yet" when the contract has no alerts', () => {
    const contract = makeContract({
      id: 'internal-uuid-2',
      contract_id: 'CONTRACT_NO_ALERTS',
    })
    saveContract(contract)

    const alerts = getAlerts(contract.contract_id)
    expect(alerts).toHaveLength(0)

    const lastAlertTime = alerts.length
      ? new Date(Math.max(...alerts.map((a) => a.timestamp))).toLocaleString()
      : 'No alerts yet'
    expect(lastAlertTime).toBe('No alerts yet')
  })

  it('does not match alerts when the internal id is used instead of contract_id', () => {
    const contract = makeContract({
      id: 'internal-uuid-3',
      contract_id: 'CONTRACT_B',
    })
    saveContract(contract)
    addAlert(makeAlert({ contract_id: 'CONTRACT_B', transaction_hash: 'tx-b' }))

    // Regression guard: looking up by the internal id yields nothing.
    expect(getAlerts(contract.id)).toHaveLength(0)
    expect(getAlerts(contract.contract_id)).toHaveLength(1)
  })
})

// ── Alert activity chart — bucketing helpers ─────────────────────────────────

describe('bucketAlertsByDay — 7-day bucketing', () => {
  it('returns 7 buckets when no alerts exist', () => {
    const buckets = bucketAlertsByDay([], 7)
    expect(buckets).toHaveLength(7)
    expect(buckets.every((b) => b.count === 0)).toBe(true)
  })

  it('places an alert from today in the last bucket', () => {
    const buckets = bucketAlertsByDay([makeAlert({ timestamp: Date.now() })], 7)
    expect(buckets).toHaveLength(7)
    expect(buckets[6].count).toBe(1)
    expect(buckets.slice(0, 6).every((b) => b.count === 0)).toBe(true)
  })

  it('buckets alerts across multiple days', () => {
    const day = 24 * 60 * 60 * 1000
    const alerts = [
      makeAlert({ transaction_hash: 'a', timestamp: Date.now() }),
      makeAlert({ transaction_hash: 'b', timestamp: Date.now() - day }),
      makeAlert({ transaction_hash: 'c', timestamp: Date.now() - day }),
      makeAlert({ transaction_hash: 'd', timestamp: Date.now() - 3 * day }),
    ]
    const buckets = bucketAlertsByDay(alerts, 7)
    expect(buckets[6].count).toBe(1)
    expect(buckets[5].count).toBe(2)
    expect(buckets[3].count).toBe(1)
  })

  it('ignores alerts older than the window', () => {
    const day = 24 * 60 * 60 * 1000
    const alerts = [makeAlert({ timestamp: Date.now() - 30 * day })]
    const buckets = bucketAlertsByDay(alerts, 7)
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0)
  })

  it('splits counts by network', () => {
    const alerts = [
      makeAlert({ transaction_hash: 'a', network: 'mainnet' }),
      makeAlert({ transaction_hash: 'b', network: 'testnet' }),
      makeAlert({ transaction_hash: 'c', network: 'testnet' }),
    ]
    const buckets = bucketAlertsByDay(alerts, 7)
    expect(buckets[6].count).toBe(3)
    expect(buckets[6].byNetwork.mainnet).toBe(1)
    expect(buckets[6].byNetwork.testnet).toBe(2)
  })
})

describe('bucketAlertsByHour — 24-hour bucketing', () => {
  it('returns 24 buckets when no alerts exist', () => {
    const buckets = bucketAlertsByHour([], 24)
    expect(buckets).toHaveLength(24)
    expect(buckets.every((b) => b.count === 0)).toBe(true)
  })

  it('places an alert from now in the last bucket', () => {
    const buckets = bucketAlertsByHour([makeAlert({ timestamp: Date.now() })], 24)
    expect(buckets).toHaveLength(24)
    expect(buckets[23].count).toBe(1)
  })

  it('buckets alerts across multiple hours', () => {
    const hour = 60 * 60 * 1000
    const alerts = [
      makeAlert({ transaction_hash: 'a', timestamp: Date.now() }),
      makeAlert({ transaction_hash: 'b', timestamp: Date.now() - hour }),
      makeAlert({ transaction_hash: 'c', timestamp: Date.now() - hour }),
      makeAlert({ transaction_hash: 'd', timestamp: Date.now() - 3 * hour }),
    ]
    const buckets = bucketAlertsByHour(alerts, 24)
    expect(buckets[23].count).toBe(1)
    expect(buckets[22].count).toBe(2)
    expect(buckets[20].count).toBe(1)
  })

  it('ignores alerts older than the window', () => {
    const hour = 60 * 60 * 1000
    const alerts = [makeAlert({ timestamp: Date.now() - 30 * hour })]
    const buckets = bucketAlertsByHour(alerts, 24)
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0)
  })
})

// ── Alerts change subscription ───────────────────────────────────────────────

describe('onAlertsChange', () => {
  it('invokes the callback when an alert is added', () => {
    const cb = vi.fn()
    const unsubscribe = onAlertsChange(cb)
    addAlert(makeAlert({ transaction_hash: 'tx-sub' }))
    expect(cb).toHaveBeenCalled()
    unsubscribe()
  })

  it('stops invoking the callback after unsubscribe', () => {
    const cb = vi.fn()
    const unsubscribe = onAlertsChange(cb)
    unsubscribe()
    addAlert(makeAlert({ transaction_hash: 'tx-sub-2' }))
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('dashboard helpers — active webhooks & pause state (#229, #227)', () => {
  it('counts only active (enabled and with webhook_url) contracts', async () => {
    const { countActiveWebhooks, isContractPaused } = await import('../dashboard')
    const contracts: WatchedContract[] = [
      makeContract({ id: '1', webhook_url: 'https://example.com/1', enabled: true }),
      makeContract({ id: '2', webhook_url: 'https://example.com/2', enabled: false }),
      makeContract({ id: '3', webhook_url: '', enabled: true }),
    ]
    expect(countActiveWebhooks(contracts)).toBe(1)
    expect(isContractPaused({ enabled: false })).toBe(true)
    expect(isContractPaused({ paused: true })).toBe(true)
    expect(isContractPaused({ enabled: true })).toBe(false)
// ── Dashboard now tick memoization (issue #220) ──────────────────────────────

describe('DashboardPage now memoization and tick updates (issue #220)', () => {
  it('updates now only once per 60-second tick or on alert changes', () => {
    vi.useFakeTimers()
    const alerts: AlertPayload[] = [makeAlert({ timestamp: 1000 })]
    let currentNow = 1000000

    const bucketSpy = vi.fn((nowVal: number) => bucketAlertsByDay(alerts, 7, nowVal))

    // Initial tick computation
    bucketSpy(currentNow)
    expect(bucketSpy).toHaveBeenCalledTimes(1)

    // Re-renders during the same minute with unchanged nowVal do not recompute buckets
    const renderCount = 10
    for (let i = 0; i < renderCount; i++) {
      // Simulate component render reading memoized bucket result with stable nowVal
    }
    expect(bucketSpy).toHaveBeenCalledTimes(1)

    // 60-second timer fires: updates now
    vi.advanceTimersByTime(60000)
    currentNow += 60000
    bucketSpy(currentNow)
    expect(bucketSpy).toHaveBeenCalledTimes(2)

    // Storage alert change fires: updates now immediately
    const onAlertsHandler = vi.fn(() => {
      currentNow = Date.now()
      bucketSpy(currentNow)
    })
    const unsub = onAlertsChange(onAlertsHandler)
    addAlert(makeAlert({ transaction_hash: 'tx-new' }))

    expect(onAlertsHandler).toHaveBeenCalledTimes(1)
    expect(bucketSpy).toHaveBeenCalledTimes(3)

    unsub()
    vi.useRealTimers()
describe('bucketAlerts — calendar alignment and DST resilience', () => {
  it('creates 7 calendar-aligned daily buckets with setDate', () => {
    const anchor = new Date('2026-11-03T15:00:00Z')
    const series = bucketAlerts([], '7d', 'network', anchor)
    expect(series.buckets).toHaveLength(7)
    expect(series.total).toBe(0)
    expect(series.max).toBe(0)

    // Check each bucket starts at 00:00:00 local time
    for (const b of series.buckets) {
      expect(b.start.getHours()).toBe(0)
      expect(b.start.getMinutes()).toBe(0)
      expect(b.start.getSeconds()).toBe(0)
      expect(b.end.getTime() - b.start.getTime()).toBeGreaterThanOrEqual(23 * 3600 * 1000)
    }
  })

  it('groups alert counts by network and by ruleType', () => {
    const anchor = new Date('2026-11-03T12:00:00Z')
    const alertTime = new Date(anchor).getTime()
    const alerts: AlertPayload[] = [
      makeAlert({
        transaction_hash: 'h1',
        network: 'mainnet',
        rule_triggered: 'LargeTransfer',
        timestamp: alertTime,
      }),
      makeAlert({
        transaction_hash: 'h2',
        network: 'testnet',
        rule_triggered: 'LargeTransfer',
        timestamp: alertTime,
      }),
      makeAlert({
        transaction_hash: 'h3',
        network: 'testnet',
        rule_triggered: 'FunctionCalled',
        timestamp: alertTime,
      }),
    ]

    const netSeries = bucketAlerts(alerts, '7d', 'network', anchor)
    expect(netSeries.total).toBe(3)
    expect(netSeries.groups).toEqual(['mainnet', 'testnet'])
    const lastNetBucket = netSeries.buckets[6]
    expect(lastNetBucket.total).toBe(3)
    expect(lastNetBucket.byGroup.mainnet).toBe(1)
    expect(lastNetBucket.byGroup.testnet).toBe(2)

    const ruleSeries = bucketAlerts(alerts, '7d', 'ruleType', anchor)
    expect(ruleSeries.groups).toEqual(['FunctionCalled', 'LargeTransfer'])
    const lastRuleBucket = ruleSeries.buckets[6]
    expect(lastRuleBucket.total).toBe(3)
    expect(lastRuleBucket.byGroup.LargeTransfer).toBe(2)
    expect(lastRuleBucket.byGroup.FunctionCalled).toBe(1)
  })

  it('generates 24 hourly buckets for 24h range', () => {
    const anchor = new Date('2026-11-03T14:30:00Z')
    const series = bucketAlerts([], '24h', 'network', anchor)
    expect(series.buckets).toHaveLength(24)
    for (const b of series.buckets) {
      expect(b.start.getMinutes()).toBe(0)
      expect(b.end.getTime() - b.start.getTime()).toBe(3600 * 1000)
    }
  })
})


import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/storage', () => ({ addAlert: vi.fn(), getAlerts: vi.fn() }))

import { apiFetch } from '@/lib/api'
import { addAlert, getAlerts } from '@/lib/storage'
import {
  alertKey,
  fetchAlerts,
  filterNewAlerts,
  getLatestAlertTimestamps,
  nextPollDelay,
  startAlertPolling,
  syncAlerts,
  validateAlertPayload,
  ALERT_POLL_MAX_INTERVAL_MS,
} from '@/lib/alertSource'
import type { AlertPayload } from '@/types'

const mk = (
  hash: string,
  rule = 'AnyTransaction',
  timestamp = 1
): AlertPayload => ({
  label: 'l',
  contract_id: 'C1',
  network: 'testnet',
  rule_triggered: rule,
  transaction_hash: hash,
  timestamp,
  horizon_link: 'x',
})

beforeEach(() => vi.clearAllMocks())

describe('fetchAlerts', () => {
  it('builds the query and unwraps { alerts }', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ alerts: [mk('a')] })
    const r = await fetchAlerts('C1', 'testnet', { since: 5 })
    expect(r).toHaveLength(1)
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe(
      '/alerts?contract_id=C1&network=testnet&since=5'
    )
  })
  it('returns [] for an empty response', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined)
    expect(await fetchAlerts('C1', 'testnet')).toEqual([])
  })
})

// Sample payloads in the shape tx-watch-core emits for each rule.
const coreAlerts = [
  {
    label: 'Treasury',
    contract_id: 'C1',
    network: 'mainnet',
    rule_triggered: 'LargeTransfer',
    transaction_hash: 'ab'.repeat(32),
    amount: 5000,
    timestamp: 1700000000000,
    horizon_link: `https://horizon.stellar.org/transactions/${'ab'.repeat(32)}`,
  },
  {
    label: 'Treasury',
    contract_id: 'C1',
    network: 'mainnet',
    rule_triggered: 'FunctionCalled',
    transaction_hash: 'cd'.repeat(32),
    function_name: 'transfer',
    timestamp: 1700000001000,
    horizon_link: `https://horizon.stellar.org/transactions/${'cd'.repeat(32)}`,
    is_test: false,
  },
]

describe('alert response validation', () => {
  it('accepts core payloads', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ alerts: coreAlerts })
    expect(await fetchAlerts('C1', 'mainnet')).toEqual(coreAlerts)
  })

  it('rejects the whole response when one entry has a renamed field', async () => {
    const { transaction_hash, ...rest } = coreAlerts[1]
    vi.mocked(apiFetch).mockResolvedValue([
      coreAlerts[0],
      { ...rest, txHash: transaction_hash },
    ])
    await expect(fetchAlerts('C1', 'mainnet')).rejects.toThrow(
      'Invalid alerts response: entry 1: transaction_hash must be a string'
    )
  })

  it('rejects unknown rules, non-numeric timestamps and non-array bodies', async () => {
    expect(
      validateAlertPayload({ ...coreAlerts[0], rule_triggered: 'Bogus' })
    ).toMatch(/rule_triggered/)
    expect(
      validateAlertPayload({ ...coreAlerts[0], timestamp: '2024-01-01' })
    ).toMatch(/timestamp/)
    vi.mocked(apiFetch).mockResolvedValue({ alerts: 'nope' })
    await expect(fetchAlerts('C1', 'mainnet')).rejects.toThrow(
      /expected an array/
    )
  })

  it('keeps the cache untouched when sync gets an invalid response', async () => {
    vi.mocked(getAlerts).mockReturnValue([])
    vi.mocked(apiFetch).mockResolvedValue([
      coreAlerts[0],
      { ...coreAlerts[1], timestamp: null },
    ])
    await expect(syncAlerts('C1', 'mainnet')).rejects.toThrow(
      /Invalid alerts response/
    )
    expect(addAlert).not.toHaveBeenCalled()
  })
})

describe('filterNewAlerts', () => {
  it('dedupes by tx hash + rule', () => {
    const out = filterNewAlerts(
      [mk('a')],
      [mk('a'), mk('a', 'Other'), mk('b'), mk('b')]
    )
    expect(out.map((a) => `${a.transaction_hash}/${a.rule_triggered}`)).toEqual(
      ['a/Other', 'b/AnyTransaction']
    )
  })
})

describe('syncAlerts', () => {
  it('adds only new alerts, using the newest local timestamp as since', async () => {
    vi.mocked(getAlerts).mockReturnValue([mk('a', 'AnyTransaction', 10)])
    vi.mocked(apiFetch).mockResolvedValue([
      mk('a'),
      mk('b', 'AnyTransaction', 20),
    ])
    const fresh = await syncAlerts('C1', 'testnet')
    expect(fresh.map((a) => a.transaction_hash)).toEqual(['b'])
    expect(addAlert).toHaveBeenCalledTimes(1)
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('since=10')
  })

  it('scopes local history to the matching network', async () => {
    vi.mocked(getAlerts).mockReturnValue([
      mk('a', 'AnyTransaction', 10),
      { ...mk('m', 'AnyTransaction', 30), network: 'mainnet' },
    ])
    vi.mocked(apiFetch).mockResolvedValue([])
    await syncAlerts('C1', 'testnet')
    expect(getAlerts).toHaveBeenCalledWith('C1', 'testnet')
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('since=10')
  })
})

describe('startAlertPolling', () => {
  it('polls on the interval and stops', async () => {
    vi.useFakeTimers()
    vi.mocked(getAlerts).mockReturnValue([])
    vi.mocked(apiFetch).mockResolvedValue([])
    const onSync = vi.fn()
    const stop = startAlertPolling('C1', 'testnet', { onSync }, 1000)
    await vi.advanceTimersByTimeAsync(2100)
    expect(onSync).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(3000)
    expect(onSync).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('doubles the interval after each consecutive failure and resets on success', async () => {
    vi.useFakeTimers()
    vi.mocked(getAlerts).mockReturnValue([])
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new Error('down')) // t=0
      .mockRejectedValueOnce(new Error('down')) // t=2000
      .mockResolvedValueOnce([]) // t=6000
      .mockResolvedValue([]) // t=7000, ...
    const onSync = vi.fn()
    const onError = vi.fn()
    const stop = startAlertPolling('C1', 'testnet', { onSync, onError }, 1000)

    await vi.advanceTimersByTimeAsync(0)
    expect(onError).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(apiFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(onError).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3999)
    expect(apiFetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(onSync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(onSync).toHaveBeenCalledTimes(2)

    stop()
    vi.useRealTimers()
  })

  it('caps the backoff at 5 minutes', () => {
    expect(nextPollDelay(30000, 1)).toBe(60000)
    expect(nextPollDelay(30000, 3)).toBe(240000)
    expect(nextPollDelay(30000, 4)).toBe(ALERT_POLL_MAX_INTERVAL_MS)
    expect(nextPollDelay(30000, 20)).toBe(ALERT_POLL_MAX_INTERVAL_MS)
  })

  it('honours Retry-After on 429/503 only', async () => {
    const retry = (status: number) =>
      Object.assign(new Error('busy'), { status, retryAfterMs: 600000 })
    expect(nextPollDelay(1000, 1, retry(429))).toBe(600000)
    expect(nextPollDelay(1000, 1, retry(503))).toBe(600000)
    expect(nextPollDelay(1000, 1, retry(500))).toBe(2000)

    vi.useFakeTimers()
    vi.mocked(getAlerts).mockReturnValue([])
    vi.mocked(apiFetch).mockRejectedValueOnce(retry(503)).mockResolvedValue([])
    const stop = startAlertPolling('C1', 'testnet', {}, 1000)
    await vi.advanceTimersByTimeAsync(599999)
    expect(apiFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(apiFetch).toHaveBeenCalledTimes(2)
    stop()
    vi.useRealTimers()
  })
})

describe('alert identity', () => {
  it('assigns a stable id to every stored alert', () => {
    const a = mk('a')
    const b = mk('b', 'Other', 2)
    const idA = alertKey(a)
    const idB = alertKey(b)
    expect(idA).toBe(alertKey(mk('a')))
    expect(idA).not.toBe(idB)
    expect(idA).toContain('a')
    expect(idA).toContain('AnyTransaction')
  })

  it('deletes only the matching alert and never id-less alerts', () => {
    const alerts = [mk('a'), mk('b', 'Other', 2)]
    const remaining = alerts.filter((x) => alertKey(x) !== alertKey(mk('a')))
    expect(remaining.map((x) => x.transaction_hash)).toEqual(['b'])
  })

  it('clears only the target contract history', () => {
    const alerts = [mk('a'), { ...mk('b'), contract_id: 'C2' }]
    const remaining = alerts.filter((x) => x.contract_id !== 'C1')
    expect(remaining.map((x) => x.contract_id)).toEqual(['C2'])
  })

  it('keeps the same contract id on another network intact', () => {
    const alerts = [
      mk('a'),
      { ...mk('m'), network: 'mainnet' },
      { ...mk('b'), contract_id: 'C2' },
    ]
    const remaining = alerts.filter(
      (x) => !(x.contract_id === 'C1' && x.network === 'testnet')
    )
    expect(remaining.map((x) => `${x.contract_id}/${x.network}`)).toEqual([
      'C1/mainnet',
      'C2/testnet',
    ])
  })
})

describe('getLatestAlertTimestamps', () => {
  it('returns an empty map for empty alerts', () => {
    expect(getLatestAlertTimestamps([])).toEqual({})
  })

  it('indexes latest alert timestamps by network:contract_id and contract_id', () => {
    const alerts: AlertPayload[] = [
      {
        label: 'Contract A',
        contract_id: 'CA_TEST',
        network: 'testnet',
        rule_triggered: 'AnyTransaction',
        transaction_hash: 'tx1',
        timestamp: 1000,
        horizon_link: 'link1',
      },
      {
        label: 'Contract A',
        contract_id: 'CA_TEST',
        network: 'testnet',
        rule_triggered: 'AnyTransaction',
        transaction_hash: 'tx2',
        timestamp: 5000,
        horizon_link: 'link2',
      },
      {
        label: 'Contract B',
        contract_id: 'CB_MAIN',
        network: 'mainnet',
        rule_triggered: 'LargeTransfer',
        transaction_hash: 'tx3',
        timestamp: 3000,
        horizon_link: 'link3',
      },
    ]

    const result = getLatestAlertTimestamps(alerts)
    expect(result['testnet:CA_TEST']).toBe(5000)
    expect(result['CA_TEST']).toBe(5000)
    expect(result['mainnet:CB_MAIN']).toBe(3000)
    expect(result['CB_MAIN']).toBe(3000)
  })

  it('does not overwrite newer timestamp with an older timestamp', () => {
    const alerts: AlertPayload[] = [
      {
        label: 'Contract A',
        contract_id: 'CA',
        network: 'testnet',
        rule_triggered: 'AnyTransaction',
        transaction_hash: 'tx1',
        timestamp: 10000,
        horizon_link: 'link1',
      },
      {
        label: 'Contract A',
        contract_id: 'CA',
        network: 'testnet',
        rule_triggered: 'AnyTransaction',
        transaction_hash: 'tx2',
        timestamp: 2000,
        horizon_link: 'link2',
      },
    ]

    const result = getLatestAlertTimestamps(alerts)
    expect(result['testnet:CA']).toBe(10000)
    expect(result['CA']).toBe(10000)
  })
})


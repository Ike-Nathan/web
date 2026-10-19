import type { AlertPayload, WatchedContract } from '@/types'
import {
  saveContract,
  deleteContract,
  getContracts,
  addAlert,
  getAlerts,
  getLatestAlert,
  deleteAlert,
  seedMockAlerts,
  addContract,
  replaceContracts,
  DuplicateContractError,
} from '../storage'
import { onStorageError, clearStorageErrorHandlers } from '../storageLogger'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { deleteAlertsByNetwork } from '../storage'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

// Fixtures previously used an `address` field that WatchedContract does not
// have, and omitted every required one.
const contract1: WatchedContract = {
  id: 'c1',
  label: 'Contract Alpha',
  contract_id: 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR',
  network: 'mainnet',
  rules: [],
  webhook_url: 'https://hooks.example.com/alpha',
  created_at: 1,
  updated_at: 1,
}
const contract2: WatchedContract = {
  id: 'c2',
  label: 'Contract Beta',
  contract_id: 'CCSHRYACRNVSLC5NP3V2DL6LGID57TQT2TJXVUVXBBZX6SED6N3F7X6J',
  network: 'testnet',
  rules: [],
  webhook_url: 'https://hooks.example.com/beta',
  created_at: 2,
  updated_at: 2,
}

const alert1: AlertPayload & { id?: string; contractId?: string } = {
  id: 'a1',
  contractId: 'c1',
  label: 'Contract Alpha',
  contract_id: 'c1',
  network: 'testnet',
  rule_triggered: 'LargeTransfer',
  transaction_hash: 'tx1',
  timestamp: 1,
  horizon_link: 'https://horizon-testnet.stellar.org/transactions/tx1',
}
const alert2: AlertPayload & { id?: string; contractId?: string } = {
  id: 'a2',
  contractId: 'c1',
  label: 'Contract Alpha',
  contract_id: 'c1',
  network: 'testnet',
  rule_triggered: 'FunctionCalled',
  transaction_hash: 'tx2',
  timestamp: 2,
  horizon_link: 'https://horizon-testnet.stellar.org/transactions/tx2',
}
const alert3: AlertPayload & { id?: string; contractId?: string } = {
  id: 'a3',
  contractId: 'c1',
  label: 'Contract Alpha',
  contract_id: 'c1',
  network: 'testnet',
  rule_triggered: 'AnyTransaction',
  transaction_hash: 'tx3',
  timestamp: 3,
  horizon_link: 'https://horizon-testnet.stellar.org/transactions/tx3',
}

beforeEach(() => localStorageMock.clear())

describe('saveContract / getContracts', () => {
  it('saves a contract and retrieves it', () => {
    saveContract(contract1)
    const contracts = getContracts()
    expect(contracts).toHaveLength(1)
    expect(contracts[0].id).toBe('c1')
  })

  it('does not touch txwatch_alerts on contract save', () => {
    addAlert(alert1)
    addAlert(alert2)
    const before = localStorage.getItem('txwatch_alerts')
    saveContract(contract1)
    saveContract(contract2)
    expect(localStorage.getItem('txwatch_alerts')).toBe(before)
  })

  it('retrieves multiple saved contracts', () => {
    saveContract(contract1)
    saveContract(contract2)
    expect(getContracts()).toHaveLength(2)
  })

  it('returns empty array when no contracts saved (empty fallback)', () => {
    expect(getContracts()).toEqual([])
  })
})

describe('replaceContracts', () => {
  it('replaces the entire contract list', () => {
    saveContract(contract1)
    replaceContracts([contract2])
    const contracts = getContracts()
    expect(contracts).toHaveLength(1)
    expect(contracts[0].id).toBe('c2')
  })

  it('preserves each contract updated_at exactly as provided', () => {
    const serverContract: WatchedContract = {
      ...contract1,
      created_at: 1000,
      updated_at: 1234567890,
    }
    replaceContracts([serverContract])
    const contracts = getContracts()
    expect(contracts).toHaveLength(1)
    expect(contracts[0].updated_at).toBe(1234567890)
    expect(contracts[0].created_at).toBe(1000)
  })

  it('does not rewrite updated_at to Date.now()', () => {
    const before = Date.now()
    replaceContracts([{ ...contract1, updated_at: 42 }])
    const after = Date.now()
    const stored = getContracts()[0]
    expect(stored.updated_at).toBe(42)
    expect(stored.updated_at).toBeLessThan(before)
    expect(stored.updated_at).toBeLessThan(after)
  })

  it('does not delete alerts for contracts absent from the new list', () => {
    saveContract(contract1)
    addAlert(alert1)
    addAlert(alert2)
    replaceContracts([contract2])
    expect(getContracts().map((c) => c.id)).toEqual(['c2'])
    expect(getAlerts('c1', 'testnet')).toHaveLength(2)
  })

  it('writes an empty list when given an empty array', () => {
    saveContract(contract1)
    replaceContracts([])
    expect(getContracts()).toEqual([])
  })
})

describe('corrupted / non-array storage values', () => {
  const cases: Array<[string, string]> = [
    ['object', '{}'],
    ['string', '"x"'],
    ['number', '42'],
    ['null', 'null'],
  ]

  for (const [name, raw] of cases) {
    it(`returns [] for a stored ${name} value`, () => {
      localStorage.setItem(STORAGE_KEYS.contracts, raw)
      expect(getContracts()).toEqual([])
    })
  }

  it('drops array entries that fail the minimal shape check', () => {
    localStorage.setItem(
      STORAGE_KEYS.contracts,
      JSON.stringify([contract1, { id: 'bad' }, null, 'nope', 7])
    )
    const contracts = getContracts()
    expect(contracts).toHaveLength(1)
    expect(contracts[0].id).toBe('c1')
  })

  it('reports corrupted and dropped entries via storageLogger', () => {
    const events: unknown[] = []
    const off = onStorageError((e) => events.push(e))
    localStorage.setItem(STORAGE_KEYS.contracts, '{}')
    getContracts()
    localStorage.setItem(
      STORAGE_KEYS.contracts,
      JSON.stringify([contract1, { id: 'bad' }])
    )
    getContracts()
    off()
    clearStorageErrorHandlers()
    expect(events.length).toBeGreaterThan(0)
  })
})

describe('deleteContract', () => {
  it('removes the correct contract by id', () => {
    saveContract(contract1)
    saveContract(contract2)
    deleteContract('c1')
    const remaining = getContracts()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('c2')
  })

  it('is a no-op when deleting a non-existent id', () => {
    saveContract(contract1)
    deleteContract('does-not-exist')
    expect(getContracts()).toHaveLength(1)
  })

  it('results in empty array after deleting the only contract', () => {
    saveContract(contract1)
    deleteContract('c1')
    expect(getContracts()).toEqual([])
  })
})

describe('duplicate contract handling', () => {
  it('does not create a duplicate when saving the same id twice', () => {
    saveContract(contract1)
    saveContract({ ...contract1, label: 'Updated Label' })
    const contracts = getContracts()
    expect(contracts).toHaveLength(1)
  })

  it('updates the existing entry when saving a duplicate id', () => {
    saveContract(contract1)
    saveContract({ ...contract1, label: 'Updated Label' })
    expect(getContracts()[0].label).toBe('Updated Label')
  })
})

describe('addAlert / getAlerts — newest-first ordering', () => {
  it('returns alerts sorted newest-first by timestamp', () => {
    addAlert(alert1)
    addAlert(alert2)
    addAlert(alert3)
    const alerts = getAlerts('c1')
    expect(alerts.map((a) => (a as { id?: string }).id)).toEqual([
      'a3',
      'a2',
      'a1',
    ])
  })

  it('sorts out-of-order timestamps newest-first', () => {
    addAlert(alert2)
    addAlert(alert3)
    addAlert(alert1)
    const alerts = getAlerts('c1')
    expect(alerts.map((a) => a.timestamp)).toEqual([3, 2, 1])
  })

  it('returns empty array when no alerts exist for a contract (empty fallback)', () => {
    expect(getAlerts('no-such-contract', 'testnet')).toEqual([])
  })
})

describe('getLatestAlert', () => {
  it('returns the alert with the maximum timestamp regardless of insertion order', () => {
    addAlert(alert2)
    addAlert(alert1)
    addAlert(alert3)
    const latest = getLatestAlert('c1')
    expect((latest as { id?: string }).id).toBe('a3')
    expect(latest?.timestamp).toBe(3)
  })

  it('returns undefined when no alerts exist for a contract', () => {
    expect(getLatestAlert('no-such-contract')).toBeUndefined()
  })
})

describe('deleteAlert', () => {
  it('removes only the specified alert', () => {
    addAlert(alert1)
    addAlert(alert2)
    deleteAlert('a1')
    const alerts = getAlerts('c1', 'testnet')
    expect(alerts).toHaveLength(1)
    expect((alerts[0] as { id?: string }).id).toBe('a2')
  })
})

describe('alert retention pruning', () => {
  const DAY = 24 * 60 * 60 * 1000
  const alert = (age: number) => ({
    label: 'a',
    contract_id: 'CX',
    network: 'testnet',
    rule_triggered: 'AnyTransaction',
    transaction_hash: `h${age}`,
    timestamp: Date.now() - age * DAY,
    horizon_link: '',
  })

  it('prunes on addAlert without any contract save', async () => {
    const s = await import('../storage')
    localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify([alert(100)]))
    s.addAlert(alert(1))
    expect(s.getAlerts('CX', 'testnet')).toHaveLength(1)
  })

  it('honours configurable retention', async () => {
    const s = await import('../storage')
    localStorage.setItem(
      STORAGE_KEYS.alerts,
      JSON.stringify([alert(10), alert(1)])
    )
    s.setRetentionDays(5)
    expect(s.getRetentionDays()).toBe(5)
    expect(s.getAlerts('CX', 'testnet')).toHaveLength(1)
  })
})

describe('per-contract alert cap', () => {
  const makeAlert = (i: number) => ({
    label: 'a',
    contract_id: 'CX',
    network: 'testnet',
    rule_triggered: 'AnyTransaction',
    transaction_hash: `h${i}`,
    timestamp: i,
    horizon_link: '',
  })

  it('keeps the newest 500 alerts and drops the oldest when the cap is exceeded', () => {
    for (let i = 1; i <= 501; i++) addAlert(makeAlert(i))
    const alerts = getAlerts('CX', 'testnet')
    expect(alerts).toHaveLength(500)
    expect(alerts.some((a) => a.transaction_hash === 'h501')).toBe(true)
    expect(alerts.some((a) => a.transaction_hash === 'h1')).toBe(false)
  })

  it('keeps the newest 500 of 510 inserted alerts and drops the 10 oldest', () => {
    for (let i = 1; i <= 510; i++) addAlert(makeAlert(i))
    const alerts = getAlerts('CX', 'testnet')
    expect(alerts).toHaveLength(500)
    expect(alerts[0].transaction_hash).toBe('h510')
    expect(alerts[alerts.length - 1].transaction_hash).toBe('h11')
    for (let i = 1; i <= 10; i++) {
      expect(alerts.some((a) => a.transaction_hash === `h${i}`)).toBe(false)
    }
  })

  it('enforces the cap per (contract_id, network) without touching other contracts', async () => {
    const s = await import('../storage')
    const other = { ...makeAlert(1), contract_id: 'CY' }
    s.addAlert(other)
    for (let i = 1; i <= 510; i++) addAlert(makeAlert(i))
    expect(getAlerts('CX', 'testnet')).toHaveLength(500)
    expect(getAlerts('CY', 'testnet')).toHaveLength(1)
  })

  it('honours a configurable cap', async () => {
    const s = await import('../storage')
    const original = s.getMaxAlertsPerContract()
    try {
      s.setMaxAlertsPerContract(3)
      expect(s.getMaxAlertsPerContract()).toBe(3)
      for (let i = 1; i <= 5; i++) addAlert(makeAlert(i))
      const alerts = getAlerts('CX', 'testnet')
      expect(alerts).toHaveLength(3)
      expect(alerts.map((a) => a.transaction_hash)).toEqual(['h5', 'h4', 'h3'])
    } finally {
      s.setMaxAlertsPerContract(original)
    }
  })
})

describe('retention commit semantics', () => {
  const DAY = 24 * 60 * 60 * 1000
  const alert = (age: number) => ({
    label: 'a',
    contract_id: 'CX',
    network: 'testnet',
    rule_triggered: 'AnyTransaction',
    transaction_hash: `h${age}`,
    timestamp: Date.now() - age * DAY,
    horizon_link: '',
  })

  it('does not prune on intermediate keystrokes, only on commit', async () => {
    const s = await import('../storage')
    localStorage.setItem(
      STORAGE_KEYS.alerts,
      JSON.stringify([alert(100), alert(10), alert(1)])
    )
    // Simulate typing "1" then "18" then "180" without committing.
    s.previewRetentionDays(1)
    s.previewRetentionDays(18)
    s.previewRetentionDays(180)
    expect(s.getAlerts('CX', 'testnet')).toHaveLength(3)
    // Commit the final value.
    s.setRetentionDays(180)
    expect(s.getRetentionDays()).toBe(180)
    expect(s.getAlerts('CX', 'testnet')).toHaveLength(3)
  })

  it('reports how many alerts a shrink would delete', async () => {
    const s = await import('../storage')
    localStorage.setItem(
      STORAGE_KEYS.alerts,
      JSON.stringify([alert(100), alert(10), alert(1)])
    )
    expect(s.countAlertsOlderThan(5)).toBe(2)
  })
})

describe('seedMockAlerts', () => {
  it('uses the network Horizon host, 64-hex hashes, and chronological order', () => {
    seedMockAlerts('c1', 'futurenet', 3)
    const alerts = getAlerts('c1', 'futurenet')
    expect(alerts).toHaveLength(3)
    for (const a of alerts) {
      expect(a.transaction_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(
        a.horizon_link.startsWith('https://horizon-futurenet.stellar.org/')
      ).toBe(true)
    }
    expect(alerts[0].timestamp).toBeGreaterThan(alerts[2].timestamp)
  })

  it('respects the per-contract alert cap', () => {
    seedMockAlerts('c1', 'testnet', 600)
    expect(getAlerts('c1', 'testnet')).toHaveLength(500)
  })
})

describe('addContract', () => {
  it('adds a new contract', () => {
    addContract(contract1)
    expect(getContracts()).toHaveLength(1)
  })

  it('rejects the same contract_id on the same network with a typed error', () => {
    addContract(contract1)
    expect(() => addContract({ ...contract1, id: 'other' })).toThrow(
      DuplicateContractError
    )
    expect(getContracts()).toHaveLength(1)
  })

  it('allows the same contract_id on a different network', () => {
    addContract(contract1)
    addContract({ ...contract1, id: 'other', network: 'testnet' })
    expect(getContracts()).toHaveLength(2)
  })

  it('leaves saveContract usable for updates by id', () => {
    addContract(contract1)
    saveContract({ ...contract1, label: 'Renamed' })
    expect(getContracts()).toHaveLength(1)
    expect(getContracts()[0].label).toBe('Renamed')
  })
})

describe('corrupted storage', () => {
  it('triggers the registered storage error handler and returns []', () => {
    const keys: string[] = []
    onStorageError((ctx) => keys.push(ctx.key))
    localStorage.setItem(STORAGE_KEYS.contracts, '{broken')
    expect(getContracts()).toEqual([])
    expect(keys).toEqual([STORAGE_KEYS.contracts])
    clearStorageErrorHandlers()
  })
})

describe('clearTxWatchStorage', () => {
  it('removes only TxWatch keys and leaves unrelated origin keys intact', async () => {
    const s = await import('../storage')
    localStorage.setItem(STORAGE_KEYS.contracts, JSON.stringify([contract1]))
    localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify([alert1]))
    localStorage.setItem(STORAGE_KEYS.preferences, '{}')
    localStorage.setItem('other_app_key', 'keep-me')
    s.clearTxWatchStorage()
    expect(localStorage.getItem(STORAGE_KEYS.contracts)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.alerts)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).toBeNull()
    expect(localStorage.getItem('other_app_key')).toBe('keep-me')
  })

  it('removes only the specified key when given one', async () => {
    const s = await import('../storage')
    localStorage.setItem(STORAGE_KEYS.contracts, '{broken')
    localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify([alert1]))
    s.clearTxWatchStorage([STORAGE_KEYS.contracts])
    expect(localStorage.getItem(STORAGE_KEYS.contracts)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.alerts)).not.toBeNull()
  })
})

describe('exportAllStorageData', () => {
  it('returns the registry keys that are present in storage', async () => {
    const s = await import('../storage')
    localStorage.setItem(STORAGE_KEYS.contracts, JSON.stringify([contract1]))
    localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify([alert1]))
    localStorage.setItem('other_app_key', 'nope')
    const data = s.exportAllStorageData()
    expect(Object.keys(data)).toEqual(
      expect.arrayContaining([STORAGE_KEYS.contracts, STORAGE_KEYS.alerts])
    )
    expect(data[STORAGE_KEYS.contracts]).toBe(JSON.stringify([contract1]))
    expect(data).not.toHaveProperty('other_app_key')
  })
})

describe('alerts keyed by (contract_id, network)', () => {
  it('keeps alerts for the same contract_id on different networks separate', () => {
    addAlert({ ...alert1, network: 'mainnet' })
    addAlert({ ...alert2, network: 'testnet' })
    expect(getAlerts('c1', 'mainnet')).toHaveLength(1)
    expect(getAlerts('c1', 'testnet')).toHaveLength(1)
  })
})

describe('storage write failures', () => {
  const quotaError = () =>
    new DOMException('QuotaExceededError', 'QuotaExceededError')

  afterEach(() => {
    // Restore the mock's setItem implementation for subsequent tests.
    localStorageMock.setItem = (key: string, value: string) => {
      Object.defineProperty(localStorageMock, key, {
        value,
        configurable: true,
      })
    }
  })

  it('returns false instead of throwing when storage always fails', () => {
    const original = localStorageMock.setItem
    localStorageMock.setItem = () => {
      throw quotaError()
    }
    try {
      expect(saveContract(contract1)).toBe(false)
    } finally {
      localStorageMock.setItem = original
    }
  })
})
/* … truncated 1606 chars — edit only what you need near the top … */

describe('deleteAlertsByNetwork (Issue #203)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('removes alerts only for the specified network on a contract', async () => {
    const s = await import('../storage')
    const baseAlert = {
      label: 'Test',
      rule_triggered: 'AnyTransaction',
      transaction_hash: 'abc',
      timestamp: Date.now(),
      horizon_link: '',
    }

    s.addAlert({
      ...baseAlert,
      id: '1',
      contract_id: 'C123',
      network: 'testnet',
    })
    s.addAlert({
      ...baseAlert,
      id: '2',
      contract_id: 'C123',
      network: 'mainnet',
    })
    s.addAlert({
      ...baseAlert,
      id: '3',
      contract_id: 'C999',
      network: 'testnet',
    })

    deleteAlertsByNetwork('C123', 'testnet')

    const alertsC123 = s.getAlerts('C123')
    expect(alertsC123).toHaveLength(1)
    expect(alertsC123[0].network).toBe('mainnet')

    const alertsC999 = s.getAlerts('C999')
    expect(alertsC999).toHaveLength(1)
  })
})

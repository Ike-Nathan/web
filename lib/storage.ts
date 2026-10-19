import { WatchedContract, AlertPayload, AlertRule, Network, parseAlertRule } from '@/types'
import { HORIZON_URLS } from './stellar'
import { safeParseStorage, storageLogger } from './storageLogger'
import {
  CONTRACTS_KEY,
  ALERTS_KEY,
  STORAGE_VERSION_KEY,
  RETENTION_KEY,
  ALERT_CAP_KEY,
  NOTIFICATION_PREF_KEY,
  VIEW_PREFERENCES_KEY,
  TXWATCH_KEYS,
} from './storageKeys'

export { CONTRACTS_KEY }

const CURRENT_STORAGE_VERSION = 2
const STORAGE_EVENT = 'txwatch:storage'

function getStorage(): Storage | undefined {
  if (typeof window !== 'undefined') return window.localStorage
  return (globalThis as unknown as { localStorage?: Storage }).localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidContract(value: unknown): value is WatchedContract {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.contract_id === 'string' &&
    typeof value.network === 'string'
  )
}

function isValidAlert(value: unknown): value is AlertPayload {
  return (
    isRecord(value) &&
    typeof value.contract_id === 'string' &&
    typeof value.timestamp === 'number'
  )
}

function isValidEntry(key: string, value: unknown): boolean {
  if (key === CONTRACTS_KEY) return isValidContract(value)
  if (key === ALERTS_KEY) return isValidAlert(value)
  return true
}

function load<T>(key: string): T[] {
  const storage = getStorage()
  if (!storage) return []
  const parsed = safeParseStorage<unknown>(key, [])
  if (!Array.isArray(parsed)) {
    storageLogger.warn('storage: non-array value, resetting to []', { key, value: parsed })
    return []
  }
  const valid = parsed.filter((entry) => isValidEntry(key, entry))
  if (valid.length < parsed.length) {
    storageLogger.warn('storage: dropped malformed entries', {
      key,
      dropped: parsed.length - valid.length,
    })
  }
  return valid as T[]
}

const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 
const MAX_ALERTS_PER_CONTRACT = 500
const DEFAULT_RETENTION_DAYS = 90

export function getRetentionDays(): number {
  const raw = Number(getStorage()?.getItem(RETENTION_KEY))
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_RETENTION_DAYS
}

export function setRetentionDays(days: number) {
  const storage = getStorage()
  if (!storage || !Number.isFinite(days) || days < 1) return
  storage.setItem(RETENTION_KEY, String(Math.floor(days)))
  pruneOldAlerts()
}

export function getAlertCap(): number {
  const raw = Number(getStorage()?.getItem(ALERT_CAP_KEY))
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : MAX_ALERTS_PER_CONTRACT
}

export function setAlertCap(cap: number) {
  const storage = getStorage()
  if (!storage || !Number.isFinite(cap) || cap < 1) return
  storage.setItem(ALERT_CAP_KEY, String(Math.floor(cap)))
}

function getStorageSize(): number {
  const storage = getStorage()
  if (!storage) return 0
  let size = 0
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key) continue
    const value = storage.getItem(key)
    if (value !== null) {
      size += (value.length + key.length) * 2 
    }
  }
  return size
}

export function pruneOldAlerts() {
  const storage = getStorage()
  if (!storage) return
  const cutoff = Date.now() - getRetentionDays() * 24 * 60 * 60 * 1000
  const alerts = load<AlertPayload>(ALERTS_KEY)
  const withinRetention = alerts.filter((a) => a.timestamp >= cutoff)
  const pruned = capAlertsPerContract(withinRetention)
  if (pruned.length < alerts.length) {
    try {
      storage.setItem(ALERTS_KEY, JSON.stringify(pruned))
    } catch {
      // best effort
    }
  }
}

function trimAlertsToRetention() {
  const storage = getStorage()
  if (!storage) return
  const alerts = load<AlertPayload>(ALERTS_KEY)
  const cutoff = Date.now() - getRetentionDays() * 24 * 60 * 60 * 1000
  const withinRetention = alerts.filter((a) => a.timestamp >= cutoff)
  const trimmed = capAlertsPerContract(withinRetention)
  if (trimmed.length < alerts.length) {
    try {
      storage.setItem(ALERTS_KEY, JSON.stringify(trimmed))
    } catch {
      // best effort
    }
  }
}

function isQuotaError(err: unknown): boolean {
  const e = err as { name?: string; code?: number } | null
  return (
    !!e &&
    (e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 ||
      e.code === 1014)
  )
}

function writeItem(storage: Storage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value)
    return true
  } catch (err) {
    if (!isQuotaError(err)) return false
  }
  trimAlertsToRetention()
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function notifyChange(key: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key } }))
}

function save<T>(key: string, data: T[]): boolean {
  const ok = saveInternal(key, data)
  if (ok) notifyChange(key)
  return ok
}

function saveInternal<T>(key: string, data: T[]): boolean {
  const storage = getStorage()
  if (!storage) return false

  if (key === ALERTS_KEY) {
    const size = getStorageSize()
    if (size > STORAGE_QUOTA_BYTES * 0.9) {
      const cutoff = Date.now() - getRetentionDays() * 24 * 60 * 60 * 1000
      const withinRetention = (data as AlertPayload[]).filter((a) => a.timestamp >= cutoff)
      data = capAlertsPerContract(withinRetention) as unknown as T[]
    }
    return writeItem(storage, key, JSON.stringify(data))
  }

  const ok = writeItem(storage, key, JSON.stringify(data))

  const size = getStorageSize()
  if (size > STORAGE_QUOTA_BYTES * 0.9) {
    trimAlertsToRetention()
  }
  return ok
}

function getStorageVersion(): number {
  const storage = getStorage()
  if (!storage) return CURRENT_STORAGE_VERSION
  const parsed = parseInt(storage.getItem(STORAGE_VERSION_KEY) ?? '0', 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function setStorageVersion(version: number) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(STORAGE_VERSION_KEY, version.toString())
}

export function migrateStorage(migrations: Record<number, () => void>) {
  const currentVersion = getStorageVersion()
  for (let v = currentVersion + 1; v <= CURRENT_STORAGE_VERSION; v++) {
    if (migrations[v]) {
      migrations[v]()
    }
  }
  setStorageVersion(CURRENT_STORAGE_VERSION)
}

export function migrateContractsToV2() {
  const contracts = getContracts()
  const migrated = contracts.map((c) => ({
    ...c,
    enabled: c.enabled ?? true,
  }))
  save(CONTRACTS_KEY, migrated)
}

export function getContracts(): WatchedContract[] {
  return load<WatchedContract>(CONTRACTS_KEY).map((c) => ({
    ...c,
    rules: Array.isArray(c.rules)
      ? c.rules.map(parseAlertRule).filter((r): r is AlertRule => r !== null)
      : [],
  }))
}

export function getContract(id: string): WatchedContract | undefined {
  return getContracts().find((c) => c.id === id)
}

export function getNetworkDistribution(): Record<Network, number> {
  return getContracts().reduce((counts, contract) => {
    counts[contract.network] = (counts[contract.network] ?? 0) + 1
    return counts
  }, {} as Record<Network, number>)
}

export function getContractByIdAndNetwork(
  contractId: string,
  network: string
): WatchedContract | undefined {
  return getContracts().find((c) => c.contract_id === contractId && c.network === network)
}

export class DuplicateContractError extends Error {
  constructor(contractId: string, network: string) {
    super(`Contract ${contractId} is already registered on ${network}`)
    this.name = 'DuplicateContractError'
  }
}

export function addContract(contract: WatchedContract) {
  if (getContractByIdAndNetwork(contract.contract_id, contract.network)) {
    throw new DuplicateContractError(contract.contract_id, contract.network)
  }
  saveContract(contract)
}

export function replaceContracts(list: WatchedContract[]): boolean {
  const normalized = list.map((c) => ({ ...c, enabled: c.enabled ?? true }))
  return save(CONTRACTS_KEY, normalized)
}

export function saveContract(contract: WatchedContract): boolean {
  const contracts = getContracts()

  const duplicate = contracts.find(
    (c) => c.contract_id === contract.contract_id && c.network === contract.network && c.id !== contract.id
  )
  if (duplicate) {
    throw new DuplicateContractError(contract.contract_id, contract.network)
  }

  const updated = { ...contract, enabled: contract.enabled ?? true, updated_at: Date.now() }
  const index = contracts.findIndex((c) => c.id === contract.id)
  if (index === -1) {
    return save(CONTRACTS_KEY, [...contracts, updated])
  }
  const next = contracts.slice()
  next[index] = updated
  return save(CONTRACTS_KEY, next)
}

export function setContractEnabled(id: string, enabled: boolean): boolean {
  const contract = getContract(id)
  if (!contract) return false
  return saveContract({ ...contract, enabled })
}

export function toggleContractEnabled(id: string): boolean {
  const contract = getContract(id)
  if (!contract) return false
  return saveContract({ ...contract, enabled: !(contract.enabled ?? true) })
}

export function getActiveContractCount(): number {
  return getContracts().filter((c) => c.enabled ?? true).length
}

export function deleteContract(id: string) {
  const contract = getContract(id)
  save(CONTRACTS_KEY, getContracts().filter((c) => c.id !== id))
  if (contract) {
    deleteAlerts(contract.contract_id)
  }
}

export function deleteAlerts(contractId: string) {
  const alerts = load<AlertPayload>(ALERTS_KEY)
  save(ALERTS_KEY, alerts.filter((a) => a.contract_id !== contractId))
}

export function replaceAlerts(alerts: AlertPayload[]): boolean {
  const valid = alerts.filter((a) => isValidAlert(a))
  return save(ALERTS_KEY, valid)
}

export function rekeyAlerts(oldContractId: string, newContractId: string): boolean {
  if (oldContractId === newContractId) return true
  const alerts = load<AlertPayload>(ALERTS_KEY)
  let changed = false
  const next = alerts.map((a) => {
    if (a.contract_id !== oldContractId) return a
    changed = true
    return { ...a, contract_id: newContractId }
  })
  if (!changed) return true
  return save(ALERTS_KEY, next)
}

export interface ViewPreferences {
  [key: string]: unknown
}

export function getNotificationPreference(): string | null {
  return getStorage()?.getItem(NOTIFICATION_PREF_KEY) ?? null
}

export function setNotificationPreference(preference: string | null) {
  const storage = getStorage()
  if (!storage) return
  if (preference === null) {
    storage.removeItem(NOTIFICATION_PREF_KEY)
  } else {
    storage.setItem(NOTIFICATION_PREF_KEY, preference)
  }
}

export function getViewPreferences(): ViewPreferences {
  const storage = getStorage()
  if (!storage) return {}
  const parsed = safeParseStorage<unknown>(VIEW_PREFERENCES_KEY, {})
  return isRecord(parsed) ? (parsed as ViewPreferences) : {}
}

export function setViewPreferences(preferences: ViewPreferences) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(preferences))
}

export function deleteAlert(alertId: string) {
  const alerts = load<AlertPayload & { id?: string }>(ALERTS_KEY)
  save(ALERTS_KEY, alerts.filter((a) => a.id !== alertId))
}

export function getAlerts(contractId: string): AlertPayload[] {
  return load<AlertPayload>(ALERTS_KEY)
    .filter((a) => a.contract_id === contractId)
    .sort((a, b) => b.timestamp - a.timestamp)
}

export function getLatestAlert(contractId: string): AlertPayload | undefined {
  return getAlerts(contractId)[0]
}

export function seedMockAlerts(
  contractId: string,
  network: Network,
  count = 5
): void {
  const now = Date.now()
  for (let index = count - 1; index >= 0; index--) {
    const sequence = index + 1
    const hash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    addAlert({
      label: `Mock Alert ${sequence}`,
      contract_id: contractId,
      network,
      rule_triggered: 'AnyTransaction',
      transaction_hash: hash,
      amount: 10 + index * 5,
      timestamp: now - index * 15 * 60 * 1000,
      horizon_link: `${HORIZON_URLS[network]}/transactions/${hash}`,
    })
  }
}

export function exportAllStorageData(): Record<string, string> {
  const storage = getStorage()
  const data: Record<string, string> = {}
  if (!storage) return data
  for (const key of TXWATCH_KEYS) {
    const value = storage.getItem(key)
    if (value !== null) data[key] = value
  }
  return data
}

export function clearTxWatchStorage(keys: string[] = TXWATCH_KEYS): void {
  const targets = keys.filter((key) => TXWATCH_KEYS.includes(key))
  const stores: Storage[] = []
  if (typeof window !== 'undefined') {
    stores.push(window.localStorage, window.sessionStorage)
  } else {
    const g = globalThis as unknown as { localStorage?: Storage; sessionStorage?: Storage }
    if (g.localStorage) stores.push(g.localStorage)
    if (g.sessionStorage) stores.push(g.sessionStorage)
  }
  for (const storage of stores) {
    for (const key of targets) {
      try {
        storage.removeItem(key)
      } catch {
        // best effort
      }
    }
  }
}

export function addAlert(alert: AlertPayload | (AlertPayload & { contractId?: string; id?: string })) {
  const normalizedAlert = {
    ...alert,
    contract_id: alert.contract_id ?? (alert as { contractId?: string }).contractId,
  }
  const all = [...load<AlertPayload>(ALERTS_KEY), normalizedAlert]
  save(ALERTS_KEY, capAlertsPerContract(all))
  return normalizedAlert
}

function capAlertsPerContract(alerts: AlertPayload[]): AlertPayload[] {
  const cap = getAlertCap()
  const groups = new Map<string, AlertPayload[]>()
  for (const alert of alerts) {
    const key = `${alert.contract_id}::${alert.network ?? ''}`
    const group = groups.get(key)
    if (group) group.push(alert)
    else groups.set(key, [alert])
  }

  const kept = new Set<AlertPayload>()
  for (const group of groups.values()) {
    if (group.length <= cap) {
      for (const alert of group) kept.add(alert)
      continue
    }
    const newest = group
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, cap)
    for (const alert of newest) kept.add(alert)
  }

  return alerts.filter((alert) => kept.has(alert))
}
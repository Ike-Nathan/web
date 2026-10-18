import type { AlertRule, Network, WatchedContract } from '@/types'
import { isAlertRuleType, parseAlertRule } from '@/types'
import { isValidContractId, isValidUrl } from '@/lib/stellar'
import { sanitizeAdminFunctionNames } from '@/lib/soroban'

/** Export file format, aligned with WatchedContract (uses contract_id, not address). */
export interface ContractsSnapshot {
  version: 1
  exportedAt: string
  count: number
  contracts: WatchedContract[]
}

/** Notification preference persisted in settings. */
type NotificationPreference = 'all' | 'alerts' | 'none'

/** View preferences persisted in settings. */
interface ViewPreferences {
  theme?: string
  sortBy?: string
  filterNetwork?: Network | 'all'
  [key: string]: unknown
}

/** Settings persisted in localStorage and included in full backups. */
export interface BackupSettings {
  retentionDays: number
  notificationPreference: NotificationPreference
  viewPreferences: ViewPreferences
}

/** Full-backup file format including contracts, alert history and settings. */
export interface BackupSnapshotV2 {
  version: 2
  exportedAt: string
  contracts: WatchedContract[]
  alerts: AlertHistoryEntry[]
  settings: BackupSettings
}

/** Minimal alert-history entry shape used by backups. */
export interface AlertHistoryEntry {
  id?: string
  contract_id: string
  network?: Network
  timestamp: number
  [key: string]: unknown
}

interface ImportEntryError {
  index: number
  message: string
}

export interface ImportParseResult {
  contracts: WatchedContract[]
  errors: ImportEntryError[]
  alerts?: AlertHistoryEntry[]
  settings?: BackupSettings
}

const NETWORKS: Network[] = ['mainnet', 'testnet', 'futurenet']

/**
 * Validates and de-duplicates a list of function names using the shared
 * Soroban symbol rules (32-char limit, valid symbol characters).
 * Returns the cleaned list or an error message naming the rejected values.
 */
function normalizeFunctionNames(names: string[]): string[] | string {
  const { valid, rejected } = sanitizeAdminFunctionNames(names)
  if (rejected.length > 0) {
    return `invalid function name(s): ${rejected.map((n) => `"${n}"`).join(', ')}`
  }
  return valid
}

export function buildSnapshot(contracts: WatchedContract[]): ContractsSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: contracts.length,
    contracts,
  }
}

const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  retentionDays: 30,
  notificationPreference: 'all',
  viewPreferences: {},
}

const NOTIFICATION_PREFERENCES: NotificationPreference[] = [
  'all',
  'alerts',
  'none',
]

/** Normalizes unknown settings input, falling back to defaults per field. */
function normalizeSettings(input: unknown): BackupSettings {
  if (typeof input !== 'object' || input === null)
    return { ...DEFAULT_BACKUP_SETTINGS }
  const s = input as Record<string, unknown>
  const retentionDays =
    typeof s.retentionDays === 'number' &&
    Number.isFinite(s.retentionDays) &&
    s.retentionDays >= 0
      ? s.retentionDays
      : DEFAULT_BACKUP_SETTINGS.retentionDays
  const notificationPreference = NOTIFICATION_PREFERENCES.includes(
    s.notificationPreference as NotificationPreference
  )
    ? (s.notificationPreference as NotificationPreference)
    : DEFAULT_BACKUP_SETTINGS.notificationPreference
  const viewPreferences =
    typeof s.viewPreferences === 'object' &&
    s.viewPreferences !== null &&
    !Array.isArray(s.viewPreferences)
      ? (s.viewPreferences as ViewPreferences)
      : { ...DEFAULT_BACKUP_SETTINGS.viewPreferences }
  return { retentionDays, notificationPreference, viewPreferences }
}

export function buildBackup(
  contracts: WatchedContract[],
  alerts: AlertHistoryEntry[],
  settings: BackupSettings
): BackupSnapshotV2 {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    contracts,
    alerts,
    settings: normalizeSettings(settings),
  }
}

/** Light shape check for alert-history entries; returns null when unusable. */
function validateAlertEntry(entry: unknown): AlertHistoryEntry | null {
  if (typeof entry !== 'object' || entry === null) return null
  const e = entry as Record<string, unknown>
  if (typeof e.contract_id !== 'string' || !e.contract_id) return null
  if (typeof e.timestamp !== 'number' || !Number.isFinite(e.timestamp))
    return null
  const result: AlertHistoryEntry = {
    ...e,
    contract_id: e.contract_id,
    timestamp: e.timestamp,
  }
  if (typeof e.id === 'string' && e.id) result.id = e.id
  if (NETWORKS.includes(e.network as Network))
    result.network = e.network as Network
  return result
}

function validateRule(rule: unknown): AlertRule | string {
  if (typeof rule !== 'object' || rule === null) return 'rule must be an object'
  const type = (rule as { type?: unknown }).type
  if (!isAlertRuleType(type)) return `unknown rule type "${String(type)}"`
  const parsed = parseAlertRule(rule)
  if (!parsed) {
    if (type === 'LargeTransfer')
      return 'threshold_xlm must be a non-negative number'
    if (type === 'AdminFunctionCalled')
      return 'function_names must be an array of strings'
    return 'function_name must be a non-empty string'
  }
  if (parsed.type === 'AdminFunctionCalled') {
    const normalized = normalizeFunctionNames(parsed.function_names)
    if (typeof normalized === 'string') return normalized
    return { ...parsed, function_names: normalized }
  }
  return parsed
}

/** Returns a normalized contract or an error message for a single entry. */
export function validateContractEntry(
  entry: unknown
): WatchedContract | string {
  if (typeof entry !== 'object' || entry === null)
    return 'entry must be an object'
  const e = entry as Record<string, unknown>
  if (typeof e.contract_id !== 'string' || !isValidContractId(e.contract_id))
    return 'invalid contract_id'
  if (!NETWORKS.includes(e.network as Network)) return 'invalid network'
  if (typeof e.webhook_url !== 'string' || !isValidUrl(e.webhook_url))
    return 'invalid webhook_url'
  if (!Array.isArray(e.rules)) return 'rules must be an array'
  const rules: AlertRule[] = []
  for (const rule of e.rules) {
    const result = validateRule(rule)
    if (typeof result === 'string') return result
    rules.push(result)
  }
  const now = Date.now()
  const contract: WatchedContract = {
    id:
      typeof e.id === 'string' && e.id ? e.id : `${e.contract_id}:${e.network}`,
    label:
      typeof e.label === 'string' && e.label.trim() ? e.label : e.contract_id,
    contract_id: e.contract_id,
    network: e.network as Network,
    rules,
    webhook_url: e.webhook_url,
    created_at: typeof e.created_at === 'number' ? e.created_at : now,
    updated_at: typeof e.updated_at === 'number' ? e.updated_at : now,
  }
  if (typeof e.enabled === 'boolean') contract.enabled = e.enabled
  return contract
}

/**
 * Parses an export file. Accepts the v1 contracts-only format and the v2
 * full-backup format. Throws only when the file as a whole is unusable
 * (bad JSON / wrong envelope); per-entry problems are reported in `errors`.
 */
export function parseImport(json: string): ImportParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON: cannot parse contract snapshot')
  }
  const isArray = Array.isArray(parsed)
  const envelope = isArray
    ? null
    : (parsed as { version?: unknown; contracts?: unknown } | null)
  const version = envelope?.version
  const list = isArray ? parsed : envelope?.contracts
  if (!Array.isArray(list) || (!isArray && version !== 1 && version !== 2)) {
    throw new Error(
      'Invalid snapshot format: expected { version: 1, contracts: [...] } or { version: 2, contracts, alerts, settings }'
    )
  }
  const contracts: WatchedContract[] = []
  const errors: ImportEntryError[] = []
  list.forEach((entry, index) => {
    const result = validateContractEntry(entry)
    if (typeof result === 'string') errors.push({ index, message: result })
    else contracts.push(result)
  })
  if (version !== 2) return { contracts, errors }

  const rawAlerts = (envelope as { alerts?: unknown }).alerts
  const alerts: AlertHistoryEntry[] = []
  if (Array.isArray(rawAlerts)) {
    for (const entry of rawAlerts) {
      const result = validateAlertEntry(entry)
      if (result) alerts.push(result)
    }
  }
  const settings = normalizeSettings(
    (envelope as { settings?: unknown }).settings
  )
  return { contracts, errors, alerts, settings }
}

export type ImportMode = 'merge' | 'replace'
export type DuplicateStrategy = 'skip' | 'overwrite'

export interface ImportPlan {
  toSave: WatchedContract[]
  toDeleteIds: string[]
  duplicates: WatchedContract[]
}

/** Duplicate = same contract_id + network as an existing contract. */
export function planImport(
  existing: WatchedContract[],
  incoming: WatchedContract[],
  mode: ImportMode,
  duplicates: DuplicateStrategy
): ImportPlan {
  const key = (c: WatchedContract) => `${c.network}:${c.contract_id}`
  const byKey = new Map(existing.map((c) => [key(c), c]))
  const dups: WatchedContract[] = []
  const toSave: WatchedContract[] = []
  for (const c of incoming) {
    const match = byKey.get(key(c))
    if (mode === 'merge' && match) {
      dups.push(c)
      if (duplicates === 'overwrite') toSave.push({ ...c, id: match.id })
    } else {
      toSave.push(c)
    }
  }
  const toDeleteIds = mode === 'replace' ? existing.map((c) => c.id) : []
  return { toSave, toDeleteIds, duplicates: dups }
}

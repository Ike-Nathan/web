import { WatchedContract } from '@/types'

export type SortOption = 'newest' | 'oldest' | 'label-asc' | 'label-desc'
export type ContractViewMode = 'flat' | 'grouped'

export interface ContractPrefs {
  v: 1
  viewMode: ContractViewMode
  sortBy: SortOption
}

export const CONTRACT_PREFS_KEY = 'txwatch_prefs'

export const DEFAULT_CONTRACT_PREFS: ContractPrefs = {
  v: 1,
  viewMode: 'flat',
  sortBy: 'newest',
}

const VIEW_MODES: ContractViewMode[] = ['flat', 'grouped']
const SORT_OPTIONS: SortOption[] = ['newest', 'oldest', 'label-asc', 'label-desc']

function isViewMode(value: unknown): value is ContractViewMode {
  return typeof value === 'string' && (VIEW_MODES as string[]).includes(value)
}

function isSortBy(value: unknown): value is SortOption {
  return typeof value === 'string' && (SORT_OPTIONS as string[]).includes(value)
}

/**
 * Read persisted contract view preferences from localStorage.
 * Handles schema migration from older conflicting versions.
 */
export function loadContractPrefs(): ContractPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_CONTRACT_PREFS }

  try {
    const raw = window.localStorage.getItem(CONTRACT_PREFS_KEY)
    if (!raw) return { ...DEFAULT_CONTRACT_PREFS }

    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_CONTRACT_PREFS }
    }

    // Migrate from v0 (or divergent schemas like { sortBy: "network" }) to v1
    if (parsed.v !== 1) {
      return {
        v: 1,
        viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : DEFAULT_CONTRACT_PREFS.viewMode,
        sortBy: isSortBy(parsed.sortBy) ? parsed.sortBy : DEFAULT_CONTRACT_PREFS.sortBy,
      }
    }

    return {
      v: 1,
      viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : DEFAULT_CONTRACT_PREFS.viewMode,
      sortBy: isSortBy(parsed.sortBy) ? parsed.sortBy : DEFAULT_CONTRACT_PREFS.sortBy,
    }
  } catch {
    return { ...DEFAULT_CONTRACT_PREFS }
  }
}

/**
 * Persist contract view preferences to localStorage. Failures (e.g. private
 * browsing, quota) are swallowed so the UI keeps working without storage.
 */
export function saveContractPrefs(prefs: Omit<ContractPrefs, 'v'>): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(CONTRACT_PREFS_KEY, JSON.stringify({ v: 1, ...prefs }))
  } catch {
    // Ignore storage errors; preferences simply won't persist.
  }
}

/**
 * Resolve the effective preferences, letting URL params take precedence over
 * stored preferences. Invalid URL values are ignored in favour of stored ones.
 */
export function resolveContractPrefs(
  params: { view?: string | null; sort?: string | null } = {},
  stored: ContractPrefs = loadContractPrefs()
): ContractPrefs {
  return {
    v: 1,
    viewMode: isViewMode(params.view) ? params.view : stored.viewMode,
    sortBy: isSortBy(params.sort) ? params.sort : stored.sortBy,
  }
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/**
 * Sort a list of watched contracts by the given option.
 *
 * Label sorting uses an `Intl.Collator` with `sensitivity: "base"` so that
 * ordering is case- and locale-aware, and falls back to `created_at` (then
 * `id`) as a stable tie-breaker so equal labels keep a deterministic order.
 */
export function sortContracts(
  contracts: WatchedContract[],
  sortBy: SortOption
): WatchedContract[] {
  const sorted = [...contracts]
  switch (sortBy) {
    case 'oldest':
      return sorted.sort((a, b) => a.created_at - b.created_at)
    case 'label-asc':
      return sorted.sort(
        (a, b) =>
          collator.compare(a.label, b.label) ||
          a.created_at - b.created_at ||
          a.id.localeCompare(b.id)
      )
    case 'label-desc':
      return sorted.sort(
        (a, b) =>
          collator.compare(b.label, a.label) ||
          a.created_at - b.created_at ||
          a.id.localeCompare(b.id)
      )
    case 'newest':
    default:
      return sorted.sort((a, b) => b.created_at - a.created_at)
  }
}
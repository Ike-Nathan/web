/**
 * Single registry of all storage keys used by the application.
 *
 * Every module that reads from or writes to `localStorage` should import its
 * keys from here instead of hard-coding strings. This keeps prefixes
 * consistent, prevents accidental collisions, and gives backup/export and
 * "reset app data" flows a single place to enumerate keys.
 */

/** Contracts tracked by the user. */
export const CONTRACTS_KEY = 'txwatch_contracts'

/** Alerts generated for tracked contracts. */
export const ALERTS_KEY = 'txwatch_alerts'

/** User preferences. */
export const PREFS_KEY = 'txwatch_prefs'

/** Last contract sync status. */
export const SYNC_STATUS_KEY = 'txwatch_sync_status'

/** Contract create/update operations waiting to be retried against the API. */
export const SYNC_QUEUE_KEY = 'txwatch_sync_queue'

/** Number of days to retain alerts. */
export const ALERT_RETENTION_DAYS_KEY = 'txwatch_alert_retention_days'

/**
 * Whether notifications are enabled.
 *
 * Migrated from the legacy colon-prefixed key `txwatch:notifications-enabled`.
 */
export const NOTIFICATIONS_KEY = 'txwatch_notifications_enabled'

/**
 * Public key of the connected Freighter wallet.
 *
 * Migrated from the legacy unprefixed key `freighter_public_key`.
 */
export const FREIGHTER_PUBLIC_KEY = 'txwatch_freighter_public_key'

/** Version of the persisted storage schema. */
export const STORAGE_VERSION_KEY = 'txwatch_storage_version'

/** Session key: last contract created by the user. */
export const LAST_CREATED_CONTRACT_KEY = 'txwatch_last_created_contract'

/** Session key: contract flagged as a duplicate. */
export const DUPLICATE_CONTRACT_KEY = 'txwatch_duplicate_contract'

/**
 * Frozen list of every storage key managed by the application.
 *
 * Use this for backup/export and "reset app data" flows so that new keys are
 * automatically included.
 */
export const TXWATCH_KEYS = Object.freeze([
  CONTRACTS_KEY,
  ALERTS_KEY,
  PREFS_KEY,
  SYNC_STATUS_KEY,
  SYNC_QUEUE_KEY,
  ALERT_RETENTION_DAYS_KEY,
  NOTIFICATIONS_KEY,
  FREIGHTER_PUBLIC_KEY,
  STORAGE_VERSION_KEY,
  LAST_CREATED_CONTRACT_KEY,
  DUPLICATE_CONTRACT_KEY,
] as const)

/**
 * Mapping of legacy storage keys to their current equivalents.
 *
 * Used by {@link migrateLegacyStorageKeys} to move existing user data to the
 * new, consistently prefixed keys.
 */
export const LEGACY_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'txwatch:notifications-enabled': NOTIFICATIONS_KEY,
  freighter_public_key: FREIGHTER_PUBLIC_KEY,
})

/**
 * Migrates legacy storage keys to their current equivalents.
 *
 * For each entry in {@link LEGACY_KEYS}, if the legacy key exists and the new
 * key does not, the value is copied to the new key. The legacy key is then
 * removed. This function is safe to call multiple times.
 *
 * @returns The list of legacy keys that were migrated.
 */
export function migrateLegacyStorageKeys(): string[] {
  const migrated: string[] = []

  if (typeof window === 'undefined' || !window.localStorage) {
    return migrated
  }

  const storage = window.localStorage

  for (const [legacyKey, newKey] of Object.entries(LEGACY_KEYS)) {
    let legacyValue: string | null = null

    try {
      legacyValue = storage.getItem(legacyKey)
    } catch {
      // Storage may be unavailable (e.g. privacy mode); skip this key.
      continue
    }

    if (legacyValue === null) {
      continue
    }

    try {
      // Only copy if the new key has not already been set, so we never
      // clobber data written by a newer version of the app.
      if (storage.getItem(newKey) === null) {
        storage.setItem(newKey, legacyValue)
      }
      storage.removeItem(legacyKey)
      migrated.push(legacyKey)
    } catch {
      // Ignore write failures (e.g. quota exceeded) and continue.
    }
  }

  return migrated
}

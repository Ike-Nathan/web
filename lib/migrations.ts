import { migrateStorage, migrateContractsToV2 } from './storage'
import { migrateLegacyStorageKeys } from './storageKeys'

// Registry of storage migrations keyed by the version they upgrade TO.
// Bump CURRENT_STORAGE_VERSION in storage.ts alongside adding an entry here.
export const migrations: Record<number, () => void> = {
  // v1: baseline schema; unversioned (v0) data is already compatible.
  1: () => {},
  // v2: backfill enabled: true on contracts.
  2: migrateContractsToV2,
  // v3: migrate legacy storage keys to the centralized registry.
  3: migrateLegacyStorageKeys,
}

export function runMigrations() {
  // Run legacy key migration first so all subsequent migrations and reads
  // operate on the canonical keys. Idempotent, so safe to run every time.
  migrateLegacyStorageKeys()
  migrateStorage(migrations)
}
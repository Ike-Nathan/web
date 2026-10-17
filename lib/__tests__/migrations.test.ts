import { migrateStorage } from '../storage';
import { migrations, runMigrations } from '../migrations';
import { CURRENT_STORAGE_VERSION } from '../constants';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

beforeEach(() => localStorageMock.clear());

describe('migrations', () => {
  it('upgrades v0 to v1 and writes the version key', () => {
    const ran: number[] = [];
    migrateStorage({ 1: () => ran.push(1) });
    expect(ran).toEqual([1]);
    expect(store['txwatch_storage_version']).toBe('1');
  });

  it('is idempotent', () => {
    const ran: number[] = [];
    migrateStorage({ 1: () => ran.push(1) });
    migrateStorage({ 1: () => ran.push(1) });
    expect(ran).toEqual([1]);
    expect(store['txwatch_storage_version']).toBe('1');
  });

  it('runMigrations uses the registry', () => {
    expect(migrations[1]).toBeTypeOf('function');
    runMigrations();
    expect(store['txwatch_storage_version']).toBe(String(CURRENT_STORAGE_VERSION));
  });

  it('runs v2 backfill on v0 data so contracts end up enabled', () => {
    store['txwatch_contracts'] = JSON.stringify([
      { id: 'A', name: 'Alpha' },
      { id: 'B', name: 'Beta' },
    ]);
    runMigrations();
    const contracts = JSON.parse(store['txwatch_contracts']);
    expect(contracts).toHaveLength(2);
    contracts.forEach((c: { enabled?: boolean }) => expect(c.enabled).toBe(true));
    expect(store['txwatch_storage_version']).toBe(String(CURRENT_STORAGE_VERSION));
  });

  it('runs v2 backfill on v1 data so contracts end up enabled', () => {
    store['txwatch_storage_version'] = '1';
    store['txwatch_contracts'] = JSON.stringify([
      { id: 'A', name: 'Alpha' },
      { id: 'B', name: 'Beta', enabled: false },
    ]);
    runMigrations();
    const contracts = JSON.parse(store['txwatch_contracts']);
    expect(contracts).toHaveLength(2);
    contracts.forEach((c: { enabled?: boolean }) => expect(c.enabled).toBe(true));
    expect(store['txwatch_storage_version']).toBe(String(CURRENT_STORAGE_VERSION));
  });

  it('treats a non-numeric version as 0 and runs all migrations', () => {
    store['txwatch_storage_version'] = 'not-a-number';
    store['txwatch_contracts'] = JSON.stringify([{ id: 'A', name: 'Alpha' }]);
    runMigrations();
    const contracts = JSON.parse(store['txwatch_contracts']);
    expect(contracts).toHaveLength(1);
    expect(contracts[0].enabled).toBe(true);
    expect(store['txwatch_storage_version']).toBe(String(CURRENT_STORAGE_VERSION));
  });

  it('has a registered migration for every version up to CURRENT_STORAGE_VERSION', () => {
    for (let v = 1; v <= CURRENT_STORAGE_VERSION; v++) {
      expect(migrations[v], `missing migration for version ${v}`).toBeTypeOf('function');
    }
  });

  it('migrates legacy keys to the txwatch_ prefix', () => {
    store['txwatch:notifications-enabled'] = 'true';
    store['freighter_public_key'] = 'GABC123';
    runMigrations();
    expect(store['txwatch_notifications_enabled']).toBe('true');
    expect(store['txwatch_freighter_public_key']).toBe('GABC123');
    expect(store['txwatch:notifications-enabled']).toBeUndefined();
    expect(store['freighter_public_key']).toBeUndefined();
    expect(store['txwatch_storage_version']).toBe(String(CURRENT_STORAGE_VERSION));
  });
});
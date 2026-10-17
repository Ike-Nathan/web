export type StorageErrorHandler = (context: StorageErrorContext) => void;

export interface StorageErrorContext {
  key: string;
  rawValue: string | null;
  error: unknown;
  timestamp: string;
}

const errorHandlers: StorageErrorHandler[] = [];

let lastStorageError: StorageErrorContext | null = null;

/**
 * Returns the most recent storage error reported via `emitStorageError`,
 * or `null` if no storage error has occurred yet. Used by the error
 * boundary to target only the corrupted key when offering a scoped reset.
 */
export function getLastStorageError(): StorageErrorContext | null {
  return lastStorageError;
}

export function onStorageError(handler: StorageErrorHandler): void {
  errorHandlers.push(handler);
}

export function clearStorageErrorHandlers(): void {
  errorHandlers.length = 0;
}

function emitStorageError(ctx: StorageErrorContext): void {
  lastStorageError = ctx;

  const isDev =
    typeof process !== 'undefined'
      ? process.env.NODE_ENV !== 'production'
      : true;
  const debugEnabled =
    typeof process !== 'undefined'
      ? process.env.DEBUG_STORAGE === 'true'
      : false;

  if (isDev || debugEnabled) {
    console.warn(
      `[storage] Parse error for key "${ctx.key}" at ${ctx.timestamp}:`,
      ctx.error,
      '\nRaw value (first 200 chars):',
      (ctx.rawValue ?? '').slice(0, 200),
    );
  }

  for (const handler of errorHandlers) {
    try {
      handler(ctx);
    } catch {
      // Never let a handler crash the app
    }
  }
}

export function safeParseStorage<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') {
    return fallback;
  }

  const raw = localStorage.getItem(key);

  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    emitStorageError({
      key,
      rawValue: raw,
      error,
      timestamp: new Date().toISOString(),
    });
    return fallback;
  }
}

/**
 * Parse a stored value that is expected to be an array of items.
 *
 * Returns `[]` when the stored value is missing, unparseable, or not an
 * array (object, string, number, boolean, null). Individual entries that
 * fail the provided shape check are dropped instead of crashing downstream
 * consumers. Both the non-array case and dropped entries are reported via
 * the storage error handlers.
 */
export function safeParseStorageArray<T>(
  key: string,
  isValidItem: (item: unknown) => item is T,
): T[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  const raw = localStorage.getItem(key);

  if (raw === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    emitStorageError({
      key,
      rawValue: raw,
      error,
      timestamp: new Date().toISOString(),
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    emitStorageError({
      key,
      rawValue: raw,
      error: new Error(
        `Expected an array for key "${key}" but received ${parsed === null ? 'null' : typeof parsed}`,
      ),
      timestamp: new Date().toISOString(),
    });
    return [];
  }

  const valid: T[] = [];
  const dropped: unknown[] = [];

  for (const item of parsed) {
    if (isValidItem(item)) {
      valid.push(item);
    } else {
      dropped.push(item);
    }
  }

  if (dropped.length > 0) {
    emitStorageError({
      key,
      rawValue: raw,
      error: new Error(
        `Dropped ${dropped.length} invalid entr${dropped.length === 1 ? 'y' : 'ies'} for key "${key}"`,
      ),
      timestamp: new Date().toISOString(),
    });
  }

  return valid;
}

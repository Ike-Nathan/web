/**
 * Soroban function-name validation utilities.
 *
 * This module is the single source of truth for validating Soroban
 * contract function names (symbols). Soroban symbols are limited to
 * 32 characters and conventionally use an identifier-like syntax.
 */

/** Maximum length of a Soroban symbol (function name). */
const MAX_FUNCTION_NAME_LENGTH = 32

/**
 * Pattern for a valid Soroban function name.
 * Must start with a letter or underscore, followed by up to 31
 * letters, digits, or underscores.
 */
const FUNCTION_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/

/**
 * Returns true if `name` is a valid Soroban function name.
 *
 * A valid name:
 * - is a non-empty string
 * - is at most 32 characters long
 * - matches `/^[A-Za-z_][A-Za-z0-9_]{0,31}$/`
 */
export function isValidFunctionName(name: unknown): name is string {
  if (typeof name !== 'string') {
    return false
  }
  if (name.length === 0 || name.length > MAX_FUNCTION_NAME_LENGTH) {
    return false
  }
  return FUNCTION_NAME_PATTERN.test(name)
}

export interface SanitizedAdminFunctionNames {
  /** Valid, trimmed, de-duplicated function names (in first-seen order). */
  valid: string[]
  /** Invalid names (trimmed) that were rejected, de-duplicated. */
  invalid: string[]
}

/**
 * Sanitizes a list of admin function names.
 *
 * Each entry is trimmed; empty entries are dropped. Valid names are
 * de-duplicated and returned in `valid` (preserving first-seen order).
 * Rejected names are collected in `invalid` (also de-duplicated) so
 * callers can report exactly which names were rejected.
 */
export function sanitizeAdminFunctionNames(
  names: readonly unknown[] | null | undefined
): SanitizedAdminFunctionNames {
  const valid: string[] = []
  const invalid: string[] = []
  const seenValid = new Set<string>()
  const seenInvalid = new Set<string>()

  if (!Array.isArray(names)) {
    return { valid, invalid }
  }

  for (const entry of names) {
    if (typeof entry !== 'string') {
      continue
    }
    const trimmed = entry.trim()
    if (trimmed.length === 0) {
      continue
    }
    if (isValidFunctionName(trimmed)) {
      if (!seenValid.has(trimmed)) {
        seenValid.add(trimmed)
        valid.push(trimmed)
      }
    } else if (!seenInvalid.has(trimmed)) {
      seenInvalid.add(trimmed)
      invalid.push(trimmed)
    }
  }

  return { valid, invalid }
}

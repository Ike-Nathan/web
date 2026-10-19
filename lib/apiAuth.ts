/**
 * Credentials for tx-watch-core requests made by apiFetch (#256).
 * See docs/API_AUTH.md for the server contract.
 *
 * The token provider is pluggable: by default it sends the API key entered in
 * Settings, and an app can replace it (e.g. with a Freighter-signed challenge)
 * via setAuthTokenProvider.
 */

/** Returns a full Authorization header value (e.g. `Bearer abc`), or nothing to send none. */
export type AuthTokenProvider = () =>
  string | null | undefined | Promise<string | null | undefined>

/** Fired on window when the core rejects a request with 401. */
export const AUTH_REQUIRED_EVENT = 'txwatch:auth-required'

/**
 * Session-scoped so the key is not written to persistent storage or included
 * in backups/exports.
 */
export const API_KEY_SESSION_KEY = 'txwatch_api_key'

export function getApiKey(): string | null {
  try {
    return sessionStorage.getItem(API_KEY_SESSION_KEY)
  } catch {
    return null
  }
}

export function setApiKey(key: string | null): void {
  try {
    if (key) sessionStorage.setItem(API_KEY_SESSION_KEY, key)
    else sessionStorage.removeItem(API_KEY_SESSION_KEY)
  } catch {
    // storage unavailable: the key simply won't be sent
  }
}

export const apiKeyTokenProvider: AuthTokenProvider = () => {
  const key = getApiKey()
  return key ? `Bearer ${key}` : null
}

let tokenProvider: AuthTokenProvider | null = apiKeyTokenProvider

/** Replace the token provider; pass null to send no credentials. */
export function setAuthTokenProvider(provider: AuthTokenProvider | null): void {
  tokenProvider = provider
}

export async function getAuthorizationHeader(): Promise<string | null> {
  return (await tokenProvider?.()) || null
}

/** Ask the UI to prompt the user to re-authenticate. */
export function notifyAuthRequired(): void {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
}

import { vi } from 'vitest'
import { ApiError, apiFetch, parseRetryAfter } from '@/lib/api'
import {
  AUTH_REQUIRED_EVENT,
  apiKeyTokenProvider,
  setApiKey,
  setAuthTokenProvider,
} from '@/lib/apiAuth'

const ok = () => ({ ok: true, status: 200, text: async () => '{}' })
const sentHeaders = () =>
  (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Headers

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  sessionStorage.clear()
  setAuthTokenProvider(apiKeyTokenProvider)
})

describe('apiFetch authentication', () => {
  it('sends no Authorization header without credentials', async () => {
    vi.mocked(fetch).mockResolvedValue(ok() as unknown as Response)
    await apiFetch('/contracts')
    expect(sentHeaders().has('Authorization')).toBe(false)
  })

  it('sends the Settings API key as a bearer token', async () => {
    setApiKey('secret-key')
    vi.mocked(fetch).mockResolvedValue(ok() as unknown as Response)
    await apiFetch('/contracts')
    expect(sentHeaders().get('Authorization')).toBe('Bearer secret-key')
  })

  it('uses a pluggable token provider', async () => {
    setAuthTokenProvider(async () => 'Signed challenge-token')
    vi.mocked(fetch).mockResolvedValue(ok() as unknown as Response)
    await apiFetch('/contracts')
    expect(sentHeaders().get('Authorization')).toBe('Signed challenge-token')
  })

  it('never sends credentials to absolute URLs', async () => {
    setApiKey('secret-key')
    vi.mocked(fetch).mockResolvedValue(ok() as unknown as Response)
    await apiFetch('https://elsewhere.example/x')
    expect(sentHeaders().has('Authorization')).toBe(false)
  })

  it('prompts re-authentication on 401', async () => {
    const listener = vi.fn()
    window.addEventListener(AUTH_REQUIRED_EVENT, listener)
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"message":"Unauthorized"}',
    } as unknown as Response)
    const error = await apiFetch('/contracts').catch((e) => e)
    window.removeEventListener(AUTH_REQUIRED_EVENT, listener)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, message: 'Unauthorized' })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('Retry-After', () => {
  it('is exposed on ApiError', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '120' }),
      text: async () => '',
    } as unknown as Response)
    await expect(apiFetch('/alerts')).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 120000,
    })
  })

  it('parses seconds and HTTP-dates', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    expect(parseRetryAfter('30', now)).toBe(30000)
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:01:00 GMT', now)).toBe(60000)
    expect(parseRetryAfter('garbage', now)).toBeUndefined()
    expect(parseRetryAfter(null, now)).toBeUndefined()
  })
})

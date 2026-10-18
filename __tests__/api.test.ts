import { vi } from 'vitest'
import {
  apiFetch,
  buildTestWebhookPayload,
  describeRule,
  joinUrl,
  removeContract,
  sendTestWebhook,
  TEST_TX_HASH,
} from '@/lib/api'
import { horizonUrl } from '@/lib/stellar'

global.fetch = vi.fn()

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches successfully and merges headers', async () => {
    const mockData = { id: 1 }
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(mockData)),
    })

    const result = await apiFetch('/test', {
      headers: { 'X-Custom': 'value' },
    })

    // apiFetch passes a Headers instance; objectContaining cannot see into one,
    // so assert on the merged header values directly.
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({ headers: expect.any(Headers) })
    )
    const init = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1] as RequestInit
    const sent = init.headers as Headers
    expect(sent.get('X-Custom')).toBe('value')
    expect(sent.has('Content-Type')).toBe(false)
    expect(sent.get('X-Custom')).toBe('value')
    expect(result).toEqual(mockData)
  })

  it('throws error on non-OK response with text', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad request'),
    })

    await expect(apiFetch('/test')).rejects.toThrow('Bad request')
  })

  it('throws error on non-OK response without text', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(''),
    })

    await expect(apiFetch('/test')).rejects.toThrow('HTTP 500')
  })
})

describe('buildTestWebhookPayload', () => {
  it('defaults to AnyTransaction with a well-formed hash and horizon link', () => {
    const payload = buildTestWebhookPayload({
      contractId: 'CBCDEF',
      timestamp: 1700000000000,
    })

    expect(payload).toEqual({
      label: 'Test Alert',
      contract_id: 'CBCDEF',
      network: 'testnet',
      rule_triggered: 'AnyTransaction',
      transaction_hash: TEST_TX_HASH,
      timestamp: 1700000000000,
      horizon_link: `https://horizon-testnet.stellar.org/transactions/${TEST_TX_HASH}`,
      is_test: true,
    })
    // 64 lowercase hex chars, so hash-parsing receivers accept it.
    expect(payload.transaction_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(payload.horizon_link).toContain(payload.transaction_hash)
  })

  it('mirrors the rule type and function_name for FunctionCalled', () => {
    const payload = buildTestWebhookPayload({
      contractId: 'CBCDEF',
      network: 'mainnet',
      rule: { type: 'FunctionCalled', function_name: 'transfer' },
    })

    expect(payload.rule_triggered).toBe('FunctionCalled')
    expect(payload.function_name).toBe('transfer')
    expect(payload.amount).toBeUndefined()
    expect(payload.horizon_link).toBe(`${horizonUrl('mainnet')}/transactions/${payload.transaction_hash}`)
  })

  it('uses the first admin function for AdminFunctionCalled', () => {
    const payload = buildTestWebhookPayload({
      contractId: 'CBCDEF',
      rule: { type: 'AdminFunctionCalled', function_names: ['set_admin', 'upgrade'] },
    })

    expect(payload.rule_triggered).toBe('AdminFunctionCalled')
    expect(payload.function_name).toBe('set_admin')
  })

  it('carries the threshold as amount for LargeTransfer', () => {
    const payload = buildTestWebhookPayload({
      contractId: 'CBCDEF',
      rule: { type: 'LargeTransfer', threshold_xlm: 500 },
    })

    expect(payload.rule_triggered).toBe('LargeTransfer')
    expect(payload.amount).toBe(500)
    expect(payload.function_name).toBeUndefined()
  })
})

describe('describeRule', () => {
  it('labels each rule variant with its configuration', () => {
    expect(describeRule({ type: 'AnyTransaction' })).toBe('AnyTransaction')
    expect(describeRule({ type: 'TransactionFailed' })).toBe('TransactionFailed')
    expect(describeRule({ type: 'LargeTransfer', threshold_xlm: 100 })).toBe(
      'LargeTransfer (over 100 XLM)'
    )
    expect(describeRule({ type: 'FunctionCalled', function_name: ' mint ' })).toBe(
      'FunctionCalled (mint)'
    )
    expect(describeRule({ type: 'AdminFunctionCalled', function_names: ['set_admin'] })).toBe(
      'AdminFunctionCalled (set_admin)'
    )
  })
})

describe('sendTestWebhook', () => {
  const sentPayload = (): Record<string, unknown> => {
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    return JSON.parse((call[1] as RequestInit).body as string)
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the rule-aware payload for the selected rule', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 })

    await sendTestWebhook('https://example.com/webhook', {
      contractId: 'CBCDEF',
      rule: { type: 'FunctionCalled', function_name: 'transfer' },
    })

    expect(sentPayload()).toMatchObject({
      label: 'Test Alert',
      contract_id: 'CBCDEF',
      network: 'testnet',
      rule_triggered: 'AnyTransaction',
      is_test: true,
    })
    expect(sentPayload().transaction_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(sentPayload().horizon_link).toContain(
      `/transactions/${sentPayload().transaction_hash}`
    )
  })

  it('sends a pre-built payload verbatim', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 })

    const payload = buildTestWebhookPayload({ contractId: 'CBCDEF', timestamp: 42 })
    await sendTestWebhook('https://example.com/webhook', { payload })

    expect(sentPayload()).toEqual(payload)
  })

  it('throws error on webhook failure', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    })

    // A non-2xx is reported as a result rather than thrown, so the caller can
    // surface the actual status code (see app/contracts/new/page.tsx).
    await expect(
      sendTestWebhook('https://example.com/webhook', { contractId: 'CBCDEF' })
    ).resolves.toEqual({
      status: 404,
      ok: false,
    })
  })

  it('times out even when caller signal is provided (#22)', async () => {
    vi.useFakeTimers()
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
          })
        })
    )

    const callerController = new AbortController()
    const promise = sendTestWebhook(
      'https://example.com/webhook',
      'CBCDEF',
      'testnet',
      callerController.signal
    )

    vi.advanceTimersByTime(10001)

    await expect(promise).rejects.toThrow('Webhook request timed out')
    vi.useRealTimers()
  })

  it('distinguishes caller cancellation from timeout (#22)', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('cancelled by caller'), { name: 'AbortError' }))
          })
        })
    )

    const callerController = new AbortController()
    const promise = sendTestWebhook(
      'https://example.com/webhook',
      'CBCDEF',
      'testnet',
      callerController.signal
    )

    callerController.abort()

    await expect(promise).rejects.toThrow('cancelled by caller')
  })
})

describe('apiFetch hardening', () => {
  const f = () => global.fetch as unknown as ReturnType<typeof vi.fn>

  it('returns undefined for 204 and empty bodies', async () => {
    f().mockResolvedValueOnce({ ok: true, status: 204, text: () => Promise.resolve('') })
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined()
    f().mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('') })
    await expect(apiFetch('/x')).resolves.toBeUndefined()
  })

  it('sets Content-Type only when a body is sent', async () => {
    f().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('{}') })
    await apiFetch('/x', { method: 'POST', body: '{}' })
    const init = f().mock.calls.at(-1)![1] as RequestInit
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json')
  })

  it('times out and aborts the request', async () => {
    f().mockImplementation((_u: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        )
      })
    )
    await expect(apiFetch('/x', { timeoutMs: 10 })).rejects.toThrow('Request timed out')
  })

  it('propagates a caller abort', async () => {
    f().mockImplementation((_u: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        )
      })
    )
    const ac = new AbortController()
    const p = apiFetch('/x', { signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toThrow('aborted')
  })
})

describe('joinUrl', () => {
  it('joins with a single slash', () => {
    expect(joinUrl('http://a/', '/b')).toBe('http://a/b')
    expect(joinUrl('http://a', 'b')).toBe('http://a/b')
    expect(joinUrl('', '/b')).toBe('/b')
  })
})

describe('removeContract', () => {
  const f = () => global.fetch as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends a DELETE through apiFetch with a single-slash URL (#252)', async () => {
    f().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') })

    await expect(removeContract('abc123')).resolves.toBeUndefined()

    expect(f()).toHaveBeenCalledTimes(1)
    const [url, init] = f().mock.calls[0]
    expect(url).toBe('http://api/contracts/abc123')
    expect(url).not.toContain('//contracts')
    expect((init as RequestInit).method).toBe('DELETE')
  })
})

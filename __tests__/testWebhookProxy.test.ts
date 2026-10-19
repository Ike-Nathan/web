// @vitest-environment node
import { vi } from 'vitest'

vi.mock('node:dns', () => ({
  default: {
    lookup: (
      host: string,
      _opts: unknown,
      cb: (
        err: Error | null,
        addresses: { address: string; family: number }[]
      ) => void
    ) => {
      const match = host.match(/^(\d+\.\d+\.\d+\.\d+)\.nip\.io$/)
      cb(null, [{ address: match ? match[1] : '93.184.216.34', family: 4 }])
    },
  },
}))

vi.mock('@/lib/webhookProxy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/webhookProxy')>()),
  deliverWebhook: vi.fn(async () => ({ status: 200, location: null })),
}))

import type { NextRequest } from 'next/server'
import { POST } from '@/app/api/test-webhook/route'
import { deliverWebhook } from '@/lib/webhookProxy'

const CID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4'
let ipCounter = 0

function request(
  body: unknown,
  headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' },
  ip = `203.0.113.${++ipCounter}`
) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    headers: new Headers({ 'x-forwarded-for': ip, ...headers }),
    text: async () => text,
  } as unknown as NextRequest
}

const valid = {
  url: 'https://hooks.example.com/x',
  contractId: CID,
  network: 'testnet',
}

beforeEach(() => vi.mocked(deliverWebhook).mockClear())

describe('POST /api/test-webhook', () => {
  it('builds the payload server-side and ignores a forwarded payload', async () => {
    const res = await POST(
      request({
        ...valid,
        rule: { type: 'FunctionCalled', function_name: 'swap' },
        payload: { spam: true },
      })
    )
    expect(res.status).toBe(200)
    const [url, body] = vi.mocked(deliverWebhook).mock.calls[0]
    expect(String(url)).toBe(valid.url)
    expect(JSON.parse(body)).toMatchObject({
      contract_id: CID,
      network: 'testnet',
      rule_triggered: 'FunctionCalled',
      function_name: 'swap',
      is_test: true,
    })
    expect(JSON.parse(body)).not.toHaveProperty('spam')
  })

  it.each([
    [{ 'sec-fetch-site': 'cross-site' }],
    [{ origin: 'https://evil.example', host: 'dashboard.example' }],
    [{}],
  ])('rejects cross-origin or origin-less requests %j', async (headers) => {
    const res = await POST(request(valid, headers))
    expect(res.status).toBe(403)
    expect(deliverWebhook).not.toHaveBeenCalled()
  })

  it('accepts a matching Origin when Sec-Fetch-Site is absent', async () => {
    const res = await POST(
      request(valid, {
        origin: 'https://dashboard.example',
        host: 'dashboard.example',
      })
    )
    expect(res.status).toBe(200)
  })

  it('rate-limits to 10 requests per minute per IP', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (await POST(request(valid, undefined, '198.51.100.7'))).status
      )
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    const limited = await POST(request(valid, undefined, '198.51.100.7'))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toMatch(/^\d+$/)
  })

  it('caps the body size', async () => {
    const res = await POST(request({ ...valid, secret: 'x'.repeat(5000) }))
    expect(res.status).toBe(413)
  })

  it.each([
    [{ ...valid, contractId: 'nope' }],
    [{ ...valid, network: 'devnet' }],
    [{ ...valid, rule: { type: 'Bogus' } }],
    ['not json'],
  ])('rejects invalid input %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
  })

  it.each([
    'http://127.0.0.1.nip.io/hook',
    'http://10.0.0.5.nip.io/hook',
    'http://169.254.169.254.nip.io/latest/meta-data/',
    'http://[::1]/hook',
    'http://[::ffff:127.0.0.1]/hook',
    'http://100.64.0.1/hook',
  ])('blocks %s', async (url) => {
    const res = await POST(request({ ...valid, url }))
    expect(res.status).toBe(403)
    expect(deliverWebhook).not.toHaveBeenCalled()
  })
})

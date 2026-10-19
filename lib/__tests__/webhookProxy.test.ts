// @vitest-environment node
import { vi } from 'vitest'

const answers: Record<string, { address: string; family: number }[]> = {}
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
      const list = answers[host]
      if (!list)
        cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }), [])
      else cb(null, list)
    },
  },
}))

import {
  BlockedAddressError,
  createRateLimiter,
  deliverWebhook,
  resolvePublicAddresses,
  vettedLookup,
} from '../webhookProxy'

const lookup = (host: string, options: { all?: boolean; family?: number }) =>
  new Promise<{ err: Error | null; address: unknown }>((resolve) =>
    vettedLookup(host, options, (err, address) => resolve({ err, address }))
  )

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k]
  answers['127.0.0.1.nip.io'] = [{ address: '127.0.0.1', family: 4 }]
  answers['10.0.0.5.nip.io'] = [{ address: '10.0.0.5', family: 4 }]
  answers['mixed.example'] = [
    { address: '93.184.216.34', family: 4 },
    { address: '::1', family: 6 },
  ]
  answers['public.example'] = [
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1::1', family: 6 },
  ]
})

describe('resolvePublicAddresses', () => {
  it.each(['127.0.0.1.nip.io', '10.0.0.5.nip.io', 'mixed.example'])(
    'rejects %s because it resolves to a non-public address',
    async (host) => {
      await expect(resolvePublicAddresses(host)).rejects.toBeInstanceOf(
        BlockedAddressError
      )
    }
  )

  it('returns every address of a public name', async () => {
    expect(await resolvePublicAddresses('public.example')).toHaveLength(2)
  })
})

describe('vettedLookup', () => {
  it('only hands vetted addresses to the socket', async () => {
    expect(await lookup('public.example', { all: true })).toEqual({
      err: null,
      address: answers['public.example'],
    })
    expect(await lookup('public.example', { family: 6 })).toEqual({
      err: null,
      address: '2606:2800:220:1::1',
    })
  })

  it('refuses a name that rebinds to a private address at connect time', async () => {
    answers['rebind.example'] = [{ address: '93.184.216.34', family: 4 }]
    expect((await lookup('rebind.example', { all: true })).err).toBeNull()
    answers['rebind.example'] = [{ address: '169.254.169.254', family: 4 }]
    expect((await lookup('rebind.example', { all: true })).err).toBeInstanceOf(
      BlockedAddressError
    )
  })
})

describe('deliverWebhook', () => {
  it('never connects to a nip.io-style name that resolves to loopback', async () => {
    await expect(
      deliverWebhook(new URL('http://127.0.0.1.nip.io:1/hook'), '{}', {}, 1000)
    ).rejects.toBeInstanceOf(BlockedAddressError)
  })

  it('refuses private IP literals', async () => {
    await expect(
      deliverWebhook(
        new URL('http://[::ffff:127.0.0.1]:1/hook'),
        '{}',
        {},
        1000
      )
    ).rejects.toBeInstanceOf(BlockedAddressError)
  })
})

describe('createRateLimiter', () => {
  it('allows `limit` requests per window per key', () => {
    const limit = createRateLimiter(2, 60000)
    expect(limit('a', 0).allowed).toBe(true)
    expect(limit('a', 1).allowed).toBe(true)
    expect(limit('a', 2)).toEqual({ allowed: false, retryAfterMs: 59998 })
    expect(limit('b', 2).allowed).toBe(true)
    expect(limit('a', 60000).allowed).toBe(true)
  })
})

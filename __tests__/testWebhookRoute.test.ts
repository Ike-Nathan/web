// @vitest-environment node
import { vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { POST } from '@/app/api/test-webhook/route'

const request = (body: unknown) =>
  ({ json: async () => body }) as unknown as NextRequest

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('POST /api/test-webhook', () => {
  it('does not follow a redirect to an internal host and reports the Location', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
      })
    )

    const res = await POST(
      request({ url: 'https://attacker.example/hook', payload: {} })
    )
    const body = await res.json()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://attacker.example/hook'
    )
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      redirect: 'manual',
    })
    expect(body).toMatchObject({
      status: 302,
      ok: false,
      location: 'http://169.254.169.254/latest/meta-data/',
    })
    expect(body.error).toMatch(/redirect/)
  })

  it('reports a normal delivery', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }))
    const body = await (
      await POST(request({ url: 'https://ok.example/hook', payload: {} }))
    ).json()
    expect(body).toMatchObject({ status: 200, ok: true })
  })
})

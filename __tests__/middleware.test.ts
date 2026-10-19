import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { middleware } from '../middleware'

describe('CSP middleware', () => {
  it('sets a unique nonce in the CSP and forwards it to Next', () => {
    const firstResponse = middleware(
      new NextRequest('https://txwatch.example/')
    )
    const secondResponse = middleware(
      new NextRequest('https://txwatch.example/')
    )
    const firstCsp = firstResponse.headers.get('Content-Security-Policy') ?? ''
    const secondCsp =
      secondResponse.headers.get('Content-Security-Policy') ?? ''
    const noncePattern = /'nonce-([^']+)'/
    const firstNonce = firstCsp.match(noncePattern)?.[1]
    const secondNonce = secondCsp.match(noncePattern)?.[1]

    expect(firstNonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    expect(firstNonce).not.toBe(secondNonce)
    expect(firstResponse.headers.get('x-middleware-request-x-nonce')).toBe(
      firstNonce
    )
    expect(
      firstResponse.headers.get('x-middleware-request-content-security-policy')
    ).toBe(firstCsp)
    expect(firstCsp).toContain("frame-src 'self' https://connect.freighter.app")
  })
})

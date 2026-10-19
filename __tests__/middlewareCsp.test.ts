// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
import { SOROBAN_RPC_URLS } from '../lib/networkUrls.mjs'

function connectSrc(): string {
  const res = middleware(new NextRequest('https://dashboard.example/contracts'))
  const policy = res.headers.get('Content-Security-Policy') ?? ''
  return (
    policy
      .split(';')
      .find((directive) => directive.trim().startsWith('connect-src')) ?? ''
  )
}

describe('middleware Content-Security-Policy', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('allows the default RPC and Horizon endpoints of every network', () => {
    const directive = connectSrc()
    expect(directive).toContain(new URL(SOROBAN_RPC_URLS.mainnet).origin)
    expect(directive).toContain('https://soroban-testnet.stellar.org')
    expect(directive).toContain('https://rpc-futurenet.stellar.org')
    expect(directive).toContain('https://horizon.stellar.org')
    expect(directive).toContain('https://horizon-testnet.stellar.org')
    expect(directive).not.toContain('validationcloud')
  })

  it('allows per-network overrides, preserving scheme and port', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET',
      'https://mainnet.stellar.validationcloud.io/v1/KEY/soroban/rpc'
    )
    vi.stubEnv('NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET', 'http://localhost:8000/rpc')
    const directive = connectSrc()
    expect(directive).toContain('https://mainnet.stellar.validationcloud.io')
    expect(directive).toContain('http://localhost:8000')
    expect(directive).not.toContain('https://localhost')
  })
})

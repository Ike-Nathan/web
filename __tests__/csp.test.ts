import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../next.config.mjs'

function connectSrc(policy: string | undefined): string {
  return (
    policy
      ?.split(';')
      .find((directive) => directive.trim().startsWith('connect-src')) ?? ''
  )
}

describe('Content-Security-Policy connect-src', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('includes API and every per-network endpoint origin, preserving scheme and port', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000/api')
    vi.stubEnv(
      'NEXT_PUBLIC_HORIZON_URL_MAINNET',
      'http://localhost:8001/horizon'
    )
    vi.stubEnv(
      'NEXT_PUBLIC_HORIZON_URL_TESTNET',
      'https://test-horizon.example:9443'
    )
    vi.stubEnv(
      'NEXT_PUBLIC_HORIZON_URL_FUTURENET',
      'https://future-horizon.example:9444'
    )
    vi.stubEnv(
      'NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET',
      'http://localhost:8002/rpc'
    )
    vi.stubEnv(
      'NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET',
      'https://test-rpc.example:9445'
    )
    vi.stubEnv(
      'NEXT_PUBLIC_SOROBAN_RPC_URL_FUTURENET',
      'https://future-rpc.example:9446'
    )

    const headers = await nextConfig.headers()
    const policy = headers?.[0].headers.find(
      (header) => header.key === 'Content-Security-Policy'
    )?.value
    const directive = connectSrc(policy)

    expect(directive).toContain("'self'")
    expect(directive).toContain('http://localhost:8000')
    expect(directive).toContain('http://localhost:8001')
    expect(directive).toContain('https://test-horizon.example:9443')
    expect(directive).toContain('https://future-horizon.example:9444')
    expect(directive).toContain('http://localhost:8002')
    expect(directive).toContain('https://test-rpc.example:9445')
    expect(directive).toContain('https://future-rpc.example:9446')
    expect(directive).not.toContain('https://localhost')
  })

  it('includes testnet and futurenet default endpoints', async () => {
    for (const name of [
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_HORIZON_URL',
      'NEXT_PUBLIC_HORIZON_URL_MAINNET',
      'NEXT_PUBLIC_HORIZON_URL_TESTNET',
      'NEXT_PUBLIC_HORIZON_URL_FUTURENET',
      'NEXT_PUBLIC_SOROBAN_RPC_URL',
      'NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET',
      'NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET',
      'NEXT_PUBLIC_SOROBAN_RPC_URL_FUTURENET',
    ]) {
      vi.stubEnv(name, '')
    }

    const headers = await nextConfig.headers()
    const policy = headers?.[0].headers.find(
      (header) => header.key === 'Content-Security-Policy'
    )?.value
    const directive = connectSrc(policy)

    expect(directive).toContain('https://horizon-testnet.stellar.org')
    expect(directive).toContain('https://horizon-futurenet.stellar.org')
    expect(directive).toContain('https://soroban-testnet.stellar.org')
    expect(directive).toContain('https://rpc-futurenet.stellar.org')
  })
})

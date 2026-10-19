import { afterEach, describe, expect, it, vi } from 'vitest'
import { explorerContractUrl, explorerTxUrl } from '../explorer'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('explorer URL templates', () => {
  it('defaults to stellar.expert with the explorer network slug', () => {
    expect(explorerTxUrl('mainnet', 'abc')).toBe(
      'https://stellar.expert/explorer/public/tx/abc'
    )
    expect(explorerContractUrl('testnet', 'CABC')).toBe(
      'https://stellar.expert/explorer/testnet/contract/CABC'
    )
  })

  it('uses NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_TX / _CONTRACT when set', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_TX',
      'https://stellarchain.io/{network}/transactions/{hash}'
    )
    vi.stubEnv(
      'NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_CONTRACT',
      'https://explorer.internal/contracts/{hash}?net={network}'
    )
    expect(explorerTxUrl('mainnet', 'abc')).toBe(
      'https://stellarchain.io/public/transactions/abc'
    )
    expect(explorerContractUrl('futurenet', 'CABC')).toBe(
      'https://explorer.internal/contracts/CABC?net=futurenet'
    )
  })

  it('links custom networks only when a template is configured', () => {
    expect(explorerTxUrl('my-private-net', 'abc')).toBeNull()
    vi.stubEnv(
      'NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_TX',
      'https://explorer.internal/{network}/tx/{hash}'
    )
    expect(explorerTxUrl('my-private-net', 'abc')).toBe(
      'https://explorer.internal/my-private-net/tx/abc'
    )
  })

  it('treats a missing network as mainnet', () => {
    expect(explorerTxUrl(undefined, 'abc')).toBe(
      'https://stellar.expert/explorer/public/tx/abc'
    )
  })

  it.each([
    'javascript:alert(1)//{hash}',
    'https://example.com/no-placeholder',
    '   ',
  ])('ignores an invalid template %j', (template) => {
    vi.stubEnv('NEXT_PUBLIC_EXPLORER_URL_TEMPLATE_TX', template)
    expect(explorerTxUrl('testnet', 'abc')).toBe(
      'https://stellar.expert/explorer/testnet/tx/abc'
    )
  })

  it('URL-encodes substituted values', () => {
    expect(explorerTxUrl('testnet', 'a/b?c')).toBe(
      'https://stellar.expert/explorer/testnet/tx/a%2Fb%3Fc'
    )
  })
})

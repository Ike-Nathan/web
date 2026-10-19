import { vi } from 'vitest'
import {
  isValidContractId,
  normalizeContractId,
  contractExists,
  mapFreighterNetwork,
  validateWebhookUrl,
} from '@/lib/stellar'

describe('isValidContractId', () => {
  it('accepts valid contract IDs', () => {
    expect(isValidContractId('CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR')).toBe(
      true
    )
    expect(isValidContractId('CCSHRYACRNVSLC5NP3V2DL6LGID57TQT2TJXVUVXBBZX6SED6N3F7X6J')).toBe(true)
  })

  it('rejects wrong prefix', () => {
    expect(isValidContractId('GBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ2345')).toBe(
      false
    )
  })

  it('rejects wrong length', () => {
    expect(isValidContractId('CBCDEF')).toBe(false)
    expect(isValidContractId('CBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ2345EXTRA')).toBe(
      false
    )
  })

  it('rejects lowercase input', () => {
    expect(isValidContractId('cbcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwxyz2345')).toBe(
      false
    )
  })

  it('rejects invalid characters', () => {
    expect(isValidContractId('CBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ234!')).toBe(
      false
    )
  })

  it('rejects contract IDs with invalid checksum even if regex format matches', () => {
    // Matches /^C[A-Z2-7]{55}$/ but fails CRC16 checksum
    expect(isValidContractId('CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYQ')).toBe(
      false
    )
  })
})

describe('mapFreighterNetwork', () => {
  it('maps PUBLIC and MAINNET to mainnet', () => {
    expect(mapFreighterNetwork('PUBLIC')).toBe('mainnet')
    expect(mapFreighterNetwork('public')).toBe('mainnet')
    expect(mapFreighterNetwork('MAINNET')).toBe('mainnet')
  })

  it('maps TESTNET to testnet', () => {
    expect(mapFreighterNetwork('TESTNET')).toBe('testnet')
    expect(mapFreighterNetwork('testnet')).toBe('testnet')
  })

  it('maps FUTURENET to futurenet', () => {
    expect(mapFreighterNetwork('FUTURENET')).toBe('futurenet')
    expect(mapFreighterNetwork('futurenet')).toBe('futurenet')
  })

  it('returns null for unknown or empty networks', () => {
    expect(mapFreighterNetwork(null)).toBeNull()
    expect(mapFreighterNetwork(undefined)).toBeNull()
    expect(mapFreighterNetwork('')).toBeNull()
    expect(mapFreighterNetwork('LOCALNET')).toBeNull()
  })
})

describe('normalizeContractId', () => {
  it('returns empty string when input is empty', () => {
    expect(normalizeContractId('')).toEqual({ contractId: '' })
  })

  it('trims leading and trailing whitespace and newlines', () => {
    expect(
      normalizeContractId('  \n CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR \n  ')
    ).toEqual({
      contractId: 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR',
    })
  })

  it('converts lowercase contract ID to uppercase', () => {
    expect(
      normalizeContractId('cdso4ggzh7kbuqykoiqdcmcfsryepovdux7z4ib5twntlt2gdrkdqoyr')
    ).toEqual({
      contractId: 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR',
    })
  })

  it('extracts contract ID and public network (maps to mainnet) from Stellar Expert explorer URL', () => {
    expect(
      normalizeContractId(
        'https://stellar.expert/explorer/public/contract/CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR'
      )
    ).toEqual({
      contractId: 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR',
      network: 'mainnet',
    })
  })

  it('extracts contract ID and testnet network from Stellar Expert explorer URL', () => {
    expect(
      normalizeContractId(
        'https://stellar.expert/explorer/testnet/contract/cdso4ggzh7kbuqykoiqdcmcfsryepovdux7z4ib5twntlt2gdrkdqoyr'
      )
    ).toEqual({
      contractId: 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR',
      network: 'testnet',
    })
  })

  it('extracts contract ID and futurenet network from Stellar Expert explorer URL', () => {
    expect(
      normalizeContractId(
        'https://stellar.expert/explorer/futurenet/contract/CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR'
      )
    ).toEqual({
      contractId: 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR',
      network: 'futurenet',
    })
  })

  it('extracts contract ID from relative path /contract/C...', () => {
    expect(
      normalizeContractId('/contract/CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR')
    ).toEqual({
      contractId: 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR',
    })
  })
})

describe('validateWebhookUrl', () => {
  it('accepts a plain https URL on mainnet', () => {
    expect(validateWebhookUrl('https://example.com/hook', 'mainnet')).toEqual({ valid: true })
  })

  it('accepts a plain http URL on testnet', () => {
    expect(validateWebhookUrl('http://example.com/hook', 'testnet')).toEqual({ valid: true })
  })

  it('rejects URLs with credentials', () => {
    const result = validateWebhookUrl('https://user:pass@example.com/hook', 'mainnet')
    expect(result.valid).toBe(false)
    expect(result.code).toBe('credentials')
  })

  it('rejects credentials even on testnet', () => {
    const result = validateWebhookUrl('http://user:pass@10.0.0.5/hook', 'testnet')
    expect(result.valid).toBe(false)
    expect(result.code).toBe('credentials')
  })

  it('returns http_warning for http URLs on mainnet', () => {
    const result = validateWebhookUrl('http://example.com/hook', 'mainnet')
    expect(result.valid).toBe(true)
    expect(result.code).toBe('http_warning')
  })

  it('rejects loopback addresses', () => {
    for (const url of [
      'https://localhost/hook',
      'https://127.0.0.1/hook',
      'https://[::1]/hook',
    ]) {
      const result = validateWebhookUrl(url, 'mainnet')
      expect(result.valid).toBe(false)
      expect(result.code).toBe('loopback')
    }
  })

  it('rejects private network ranges', () => {
    for (const url of [
      'https://10.0.0.5/hook',
      'https://192.168.1.10/hook',
      'https://172.16.0.1/hook',
      'https://169.254.169.254/hook',
    ]) {
      const result = validateWebhookUrl(url, 'mainnet')
      expect(result.valid).toBe(false)
      expect(result.code).toBe('private')
    }
  })

  it('rejects malformed URLs', () => {
    const result = validateWebhookUrl('not-a-url', 'mainnet')
    expect(result.valid).toBe(false)
    expect(result.code).toBe('invalid')
  })

  it('rejects non-http(s) protocols', () => {
    const result = validateWebhookUrl('ftp://example.com/hook', 'mainnet')
    expect(result.valid).toBe(false)
    expect(result.code).toBe('invalid')
  })

  it('maps every code to a user-facing message', () => {
    const messages = getWebhookUrlMessages()
    for (const code of ['invalid', 'credentials', 'http_warning', 'loopback', 'private'] as const) {
      expect(typeof messages[code]).toBe('string')
      expect(messages[code].length).toBeGreaterThan(0)
    }
  })

  it('treats http_warning as a warning and all other codes as errors', () => {
    expect(isWebhookUrlWarning('http_warning')).toBe(true)
    for (const code of ['invalid', 'credentials', 'loopback', 'private'] as const) {
      expect(isWebhookUrlWarning(code)).toBe(false)
    }
  })
})

describe('contractExists', () => {
  const originalFetch = global.fetch
  const testContractId = 'CDSO4GGZH7KBUQYKOIQDCMCFSRYEPOVDUX7Z4IB5TWNTLT2GDRKDQOYR'

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns true when ledger entry exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          entries: [{ key: 'AAAA...', xdr: 'BBBB...' }],
        },
      }),
    } as any)

    const exists = await contractExists('testnet', testContractId)
    expect(exists).toBe(true)
  })

  it('returns false when ledger entry does not exist (empty entries array)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          entries: [],
        },
      }),
    } as any)

    const exists = await contractExists('testnet', testContractId)
    expect(exists).toBe(false)
  })

  it('returns true on RPC error response (graceful fallback)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as any)

    const exists = await contractExists('testnet', testContractId)
    expect(exists).toBe(true)
  })

  it('returns true on network timeout or fetch exception (graceful fallback)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'))

    const exists = await contractExists('testnet', testContractId)
    expect(exists).toBe(true)
  })
})

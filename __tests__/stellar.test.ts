import { vi } from 'vitest'
import { isValidContractId, normalizeContractId, contractExists } from '@/lib/stellar'
import { mapFreighterNetwork } from '@/lib/stellar'
import { FREIGHTER_NETWORK_BY_CHAIN, CHAIN_BY_FREIGHTER_NETWORK } from '@/lib/freighter'

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

describe('consolidated Freighter network maps', () => {
  it('maps every app chain to its Freighter network id', () => {
    expect(FREIGHTER_NETWORK_BY_CHAIN.mainnet).toBe('PUBLIC')
    expect(FREIGHTER_NETWORK_BY_CHAIN.testnet).toBe('TESTNET')
    expect(FREIGHTER_NETWORK_BY_CHAIN.futurenet).toBe('FUTURENET')
  })

  it('maps every Freighter network id back to its app chain', () => {
    expect(CHAIN_BY_FREIGHTER_NETWORK.PUBLIC).toBe('mainnet')
    expect(CHAIN_BY_FREIGHTER_NETWORK.TESTNET).toBe('testnet')
    expect(CHAIN_BY_FREIGHTER_NETWORK.FUTURENET).toBe('futurenet')
  })

  it('is bidirectional for every network', () => {
    for (const [chain, freighterNetwork] of Object.entries(FREIGHTER_NETWORK_BY_CHAIN)) {
      expect(CHAIN_BY_FREIGHTER_NETWORK[freighterNetwork]).toBe(chain)
    }
    for (const [freighterNetwork, chain] of Object.entries(CHAIN_BY_FREIGHTER_NETWORK)) {
      expect(FREIGHTER_NETWORK_BY_CHAIN[chain]).toBe(freighterNetwork)
    }
  })

  it('agrees with mapFreighterNetwork for every Freighter network id', () => {
    for (const [freighterNetwork, chain] of Object.entries(CHAIN_BY_FREIGHTER_NETWORK)) {
      expect(mapFreighterNetwork(freighterNetwork)).toBe(chain)
      expect(mapFreighterNetwork(freighterNetwork.toLowerCase())).toBe(chain)
    }
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

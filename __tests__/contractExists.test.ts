import { vi } from 'vitest'
import { Address, StrKey, xdr } from '@stellar/stellar-sdk'
import {
  contractExists,
  contractInstanceLedgerKey,
  getLedgerEntriesRequest,
} from '@/lib/contractExists'
import { sorobanRpcUrl } from '@/lib/stellar'

global.fetch = vi.fn()

// A checksum-valid contract StrKey (all-zero hash).
const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32))

const fetchMock = () => global.fetch as unknown as ReturnType<typeof vi.fn>

function mockRpc(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  fetchMock().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  })
}

describe('getLedgerEntriesRequest', () => {
  it('asks for the contract instance ledger key', () => {
    const parsed = JSON.parse(getLedgerEntriesRequest(CONTRACT_ID))
    expect(parsed).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'getLedgerEntries',
      params: { keys: [contractInstanceLedgerKey(CONTRACT_ID)] },
    })
  })

  it('sends a base64 LedgerKey XDR that decodes to the contract instance entry', () => {
    const [key] = JSON.parse(getLedgerEntriesRequest(CONTRACT_ID)).params.keys
    expect(typeof key).toBe('string')

    const ledgerKey = xdr.LedgerKey.fromXDR(key, 'base64')
    expect(ledgerKey.switch()).toEqual(xdr.LedgerEntryType.contractData())

    const data = ledgerKey.contractData()
    expect(Address.fromScAddress(data.contract()).toString()).toBe(CONTRACT_ID)
    expect(data.key().switch()).toEqual(xdr.ScValType.scvLedgerKeyContractInstance())
    expect(data.durability()).toEqual(xdr.ContractDataDurability.persistent())
  })
})

describe('contractExists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports found when the RPC returns an entry', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, result: { entries: [{ contract: 'AAAA' }] } })

    await expect(contractExists('testnet', CONTRACT_ID)).resolves.toEqual({ status: 'found' })

    const [url, init] = fetchMock().mock.calls[0]
    expect(url).toBe(sorobanRpcUrl('testnet'))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body).params.keys[0]).toBe(contractInstanceLedgerKey(CONTRACT_ID))
  })

  it('reports not_found when the RPC returns no entries', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, result: { entries: [] } })

    await expect(contractExists('mainnet', CONTRACT_ID)).resolves.toEqual({ status: 'not_found' })
  })

  it('rejects malformed contract IDs without calling the RPC', async () => {
    await expect(contractExists('testnet', 'not-a-contract')).resolves.toEqual({
      status: 'not_found',
    })
    expect(fetchMock()).not.toHaveBeenCalled()
  })

  it('reports unavailable (not not_found) on an RPC error, so saving is not blocked', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid key' } })

    await expect(contractExists('testnet', CONTRACT_ID)).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid key',
    })
  })

  it('reports unavailable on a non-OK HTTP response', async () => {
    mockRpc({}, { ok: false, status: 503 })

    await expect(contractExists('testnet', CONTRACT_ID)).resolves.toEqual({
      status: 'unavailable',
      reason: 'HTTP 503',
    })
  })

  it('reports unavailable when the response has no entries array', async () => {
    mockRpc({ jsonrpc: '2.0', id: 1, result: {} })

    await expect(contractExists('testnet', CONTRACT_ID)).resolves.toEqual({
      status: 'unavailable',
      reason: 'Unexpected RPC response',
    })
  })

  it('reports unavailable on a network failure', async () => {
    fetchMock().mockRejectedValue(new Error('fetch failed'))

    await expect(contractExists('testnet', CONTRACT_ID)).resolves.toEqual({
      status: 'unavailable',
      reason: 'fetch failed',
    })
  })

  it('reports unavailable on a timeout instead of hanging', async () => {
    fetchMock().mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        )
      })
    )

    await expect(contractExists('testnet', CONTRACT_ID, { timeoutMs: 10 })).resolves.toEqual({
      status: 'unavailable',
      reason: 'RPC timed out',
    })
  })

  it('reports unavailable when the caller aborts', async () => {
    fetchMock().mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        )
      })
    )

    const controller = new AbortController()
    const pending = contractExists('testnet', CONTRACT_ID, { signal: controller.signal })
    controller.abort()

    await expect(pending).resolves.toEqual({ status: 'unavailable', reason: 'Request cancelled' })
  })
})

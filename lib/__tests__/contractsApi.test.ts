import { vi } from 'vitest'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '@/lib/api'
import { listContracts } from '@/lib/contractsApi'
import { refreshContracts } from '@/lib/contractSync'
import { getContracts, replaceContracts } from '@/lib/storage'

const CID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4'

// Sample GET /contracts payload as tx-watch-core returns it.
const coreContracts = [
  {
    id: 'c1',
    label: 'Treasury',
    contract_id: CID,
    network: 'mainnet',
    rules: [
      { type: 'LargeTransfer', threshold_xlm: 1000 },
      { type: 'AdminFunctionCalled', function_names: ['set_admin', 'upgrade'] },
    ],
    webhook_url: 'https://hooks.example.com/txwatch',
    enabled: true,
    created_at: 1700000000000,
    updated_at: 1700000001000,
  },
  {
    id: 'c2',
    label: 'Pool',
    contract_id: CID,
    network: 'testnet',
    rules: [{ type: 'FunctionCalled', function_name: 'swap' }],
    webhook_url: 'https://hooks.example.com/pool',
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(() => vi.unstubAllEnvs())

describe('listContracts', () => {
  it('accepts core payloads', async () => {
    vi.mocked(apiFetch).mockResolvedValue(coreContracts)
    expect(await listContracts()).toEqual(coreContracts)
  })

  it('rejects the whole list when one entry has a renamed field', async () => {
    const { webhook_url, ...rest } = coreContracts[1]
    vi.mocked(apiFetch).mockResolvedValue([
      coreContracts[0],
      { ...rest, webhookUrl: webhook_url },
    ])
    await expect(listContracts()).rejects.toThrow(
      'Invalid contracts response: entry 1: invalid webhook_url'
    )
  })

  it('rejects non-array bodies', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ contracts: coreContracts })
    await expect(listContracts()).rejects.toThrow(/expected an array/)
  })
})

describe('refreshContracts with an invalid response', () => {
  it('keeps the local cache and surfaces the error', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api')
    replaceContracts([coreContracts[0] as never])
    vi.mocked(apiFetch).mockResolvedValue([
      { ...coreContracts[1], rules: [{ type: 'Bogus' }] },
    ])
    const r = await refreshContracts()
    expect(r.error).toMatch(/Invalid contracts response: entry 0/)
    expect(getContracts().map((c) => c.id)).toEqual(['c1'])
  })
})

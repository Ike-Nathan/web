import { buildSnapshot, parseImport, validateContractEntry } from '../importSchema'

const CID = 'C' + 'A'.repeat(55)
const good = {
  id: 'c1',
  label: 'Alpha',
  contract_id: CID,
  network: 'testnet',
  rules: [{ type: 'AnyTransaction' }],
  webhook_url: 'https://example.com/hook',
  created_at: 1,
  updated_at: 2,
}

describe('parseImport', () => {
  it('accepts valid entries', () => {
    const r = parseImport(JSON.stringify(buildSnapshot([good as never])))
    expect(r.contracts).toHaveLength(1)
    expect(r.errors).toEqual([])
  })

  it('reports per-entry errors without failing the import', () => {
    const r = parseImport(
      JSON.stringify({ version: 1, contracts: [good, { ...good, network: 'nope' }, 5] }),
    )
    expect(r.contracts).toHaveLength(1)
    expect(r.errors.map((e) => e.index)).toEqual([1, 2])
  })

  it('rejects bad JSON and bad envelope', () => {
    expect(() => parseImport('{')).toThrow(/Invalid JSON/)
    expect(() => parseImport('{"version":2,"contracts":[]}')).toThrow(/Invalid snapshot/)
  })

  it('rejects legacy address-only entries', () => {
    expect(typeof validateContractEntry({ id: 'x', address: 'GABC', network: 'mainnet' })).toBe('string')
  })

  it('validates rules and webhook url', () => {
    expect(validateContractEntry({ ...good, rules: [{ type: 'Bogus' }] })).toMatch(/rule type/)
    expect(validateContractEntry({ ...good, webhook_url: 'nope' })).toMatch(/webhook_url/)
  })

  it('rejects invalid admin function names and names the offender', () => {
    const r = validateContractEntry({
      ...good,
      rules: [{ type: 'AdminFunctionCalled', functions: ['upgrade', 'set-admin'] }],
    })
    expect(typeof r).toBe('string')
    expect(r).toMatch(/set-admin/)
    expect(r).not.toMatch(/upgrade/)
  })

  it('rejects admin function names over the 32-char symbol limit', () => {
    const long = 'a'.repeat(33)
    const r = validateContractEntry({
      ...good,
      rules: [{ type: 'AdminFunctionCalled', functions: [long] }],
    })
    expect(typeof r).toBe('string')
    expect(r).toMatch(/32/)
    expect(r).toContain(long)
  })

  it('preserves the enabled flag through validation', () => {
    expect(validateContractEntry({ ...good, enabled: true })).toMatchObject({ enabled: true })
    expect(validateContractEntry({ ...good, enabled: false })).toMatchObject({ enabled: false })
    expect(validateContractEntry(good)).not.toHaveProperty('enabled')
  })

  it('de-duplicates admin function names before saving', () => {
    const r = parseImport(
      JSON.stringify({
        version: 1,
        contracts: [
          {
            ...good,
            rules: [{ type: 'AdminFunctionCalled', functions: ['upgrade', 'upgrade'] }],
          },
        ],
      }),
    )
    expect(r.errors).toEqual([])
    expect(r.contracts[0].rules[0]).toMatchObject({
      type: 'AdminFunctionCalled',
      functions: ['upgrade'],
    })
  })
})

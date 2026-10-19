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

  describe('webhook url validation codes', () => {
    it('rejects credentials embedded in the url', () => {
      const r = validateContractEntry({
        ...good,
        webhook_url: 'https://user:pass@example.com/hook',
      })
      expect(typeof r).toBe('string')
      expect(r).toMatch(/credential/i)
    })

    it('rejects plain http on mainnet', () => {
      const r = validateContractEntry({
        ...good,
        network: 'mainnet',
        webhook_url: 'http://example.com/hook',
      })
      expect(typeof r).toBe('string')
      expect(r).toMatch(/https/i)
    })

    it('rejects loopback addresses', () => {
      const r = validateContractEntry({ ...good, webhook_url: 'http://127.0.0.1/hook' })
      expect(typeof r).toBe('string')
      expect(r).toMatch(/loopback|local/i)
    })

    it('rejects private network ranges', () => {
      const r = validateContractEntry({ ...good, webhook_url: 'http://10.0.0.5/hook' })
      expect(typeof r).toBe('string')
      expect(r).toMatch(/private/i)
    })

    it('rejects credentials plus private range on mainnet', () => {
      const r = validateContractEntry({
        ...good,
        network: 'mainnet',
        webhook_url: 'http://user:pass@10.0.0.5/hook',
      })
      expect(typeof r).toBe('string')
    })

    it('accepts http on testnet (warning only)', () => {
      const r = validateContractEntry({ ...good, webhook_url: 'http://example.com/hook' })
      expect(r).not.toBe('string')
      expect(typeof r).not.toBe('string')
    })
  })

  describe('webhook_secret', () => {
    it('preserves a valid secret through validation', () => {
      const r = validateContractEntry({ ...good, webhook_secret: 'whsec_abc123' })
      expect(typeof r).not.toBe('string')
      expect(r).toMatchObject({ webhook_secret: 'whsec_abc123' })
    })

    it('omits the secret when absent', () => {
      expect(validateContractEntry(good)).not.toHaveProperty('webhook_secret')
    })

    it('rejects a non-string secret', () => {
      const r = validateContractEntry({ ...good, webhook_secret: 42 })
      expect(typeof r).toBe('string')
      expect(r).toMatch(/webhook_secret/)
    })

    it('rejects an empty secret', () => {
      const r = validateContractEntry({ ...good, webhook_secret: '   ' })
      expect(typeof r).toBe('string')
      expect(r).toMatch(/webhook_secret/)
    })

    it('preserves the secret through parseImport', () => {
      const r = parseImport(
        JSON.stringify({ version: 1, contracts: [{ ...good, webhook_secret: 'whsec_xyz' }] }),
      )
      expect(r.errors).toEqual([])
      expect(r.contracts[0]).toMatchObject({ webhook_secret: 'whsec_xyz' })
    })
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

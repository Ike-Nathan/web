import { sortContracts, SortOption } from '../contractSort'
import type { WatchedContract } from '@/types'

const make = (
  id: string,
  label: string,
  network: string,
  createdAt: string = '2024-01-01T00:00:00.000Z'
): WatchedContract => ({
  id,
  label,
  contract_id: `C${id.toUpperCase()}`,
  network,
  rules: [],
  webhook_url: null,
  created_at: createdAt,
  updated_at: createdAt,
})

describe('sortContracts', () => {
  it('sorts newest first', () => {
    const input = [
      make('1', 'Alpha', 'mainnet', '2024-01-01T00:00:00.000Z'),
      make('2', 'Beta', 'mainnet', '2024-03-01T00:00:00.000Z'),
      make('3', 'Gamma', 'mainnet', '2024-02-01T00:00:00.000Z'),
    ]
    const sorted = sortContracts(input, 'newest')
    expect(sorted.map((c) => c.id)).toEqual(['2', '3', '1'])
  })

  it('sorts oldest first', () => {
    const input = [
      make('1', 'Alpha', 'mainnet', '2024-01-01T00:00:00.000Z'),
      make('2', 'Beta', 'mainnet', '2024-03-01T00:00:00.000Z'),
      make('3', 'Gamma', 'mainnet', '2024-02-01T00:00:00.000Z'),
    ]
    const sorted = sortContracts(input, 'oldest')
    expect(sorted.map((c) => c.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by label A–Z', () => {
    const input = [make('2', 'Zebra', 'mainnet'), make('1', 'Apple', 'mainnet')]
    const sorted = sortContracts(input, 'label-asc')
    expect(sorted[0].label).toBe('Apple')
    expect(sorted[1].label).toBe('Zebra')
  })

  it('sorts by label Z–A', () => {
    const input = [make('2', 'Zebra', 'mainnet'), make('1', 'Apple', 'mainnet')]
    const sorted = sortContracts(input, 'label-desc')
    expect(sorted[0].label).toBe('Zebra')
    expect(sorted[1].label).toBe('Apple')
  })

  it('label sort is case-insensitive', () => {
    const input = [make('2', 'beta', 'mainnet'), make('1', 'Alpha', 'mainnet')]
    const sorted = sortContracts(input, 'label-asc')
    expect(sorted[0].label).toBe('Alpha')
    expect(sorted[1].label).toBe('beta')
  })

  it('label-desc sort is case-insensitive', () => {
    const input = [make('2', 'beta', 'mainnet'), make('1', 'Alpha', 'mainnet')]
    const sorted = sortContracts(input, 'label-desc')
    expect(sorted[0].label).toBe('beta')
    expect(sorted[1].label).toBe('Alpha')
  })

  it('uses id as tiebreaker for identical label', () => {
    const input = [make('z', 'Same', 'mainnet'), make('a', 'Same', 'mainnet')]
    const sorted = sortContracts(input, 'label-asc')
    expect(sorted[0].id).toBe('a')
    expect(sorted[1].id).toBe('z')
  })

  it('uses id as tiebreaker for identical created_at', () => {
    const input = [
      make('z', 'Same', 'mainnet', '2024-01-01T00:00:00.000Z'),
      make('a', 'Same', 'mainnet', '2024-01-01T00:00:00.000Z'),
    ]
    const sorted = sortContracts(input, 'newest')
    expect(sorted[0].id).toBe('a')
    expect(sorted[1].id).toBe('z')
  })

  it('does not mutate the input array', () => {
    const input = [
      make('2', 'B', 'mainnet', '2024-01-01T00:00:00.000Z'),
      make('1', 'A', 'mainnet', '2024-02-01T00:00:00.000Z'),
    ]
    const original = [...input]
    sortContracts(input, 'label-asc')
    expect(input).toEqual(original)
  })

  it('returns empty array for empty input', () => {
    expect(sortContracts([], 'label-asc')).toEqual([])
  })

  it('returns single-element array unchanged', () => {
    const input = [make('1', 'Solo', 'mainnet')]
    expect(sortContracts(input, 'label-asc')).toEqual(input)
  })

  it('is idempotent — sorting twice gives same result', () => {
    const input = [
      make('c', 'Charlie', 'testnet', '2024-03-01T00:00:00.000Z'),
      make('a', 'Alpha', 'mainnet', '2024-01-01T00:00:00.000Z'),
      make('b', 'Beta', 'mainnet', '2024-02-01T00:00:00.000Z'),
    ]
    const once = sortContracts(input, 'label-asc')
    const twice = sortContracts(once, 'label-asc')
    expect(twice).toEqual(once)
  })

  it('supports the four sort options used by the page', () => {
    const options: SortOption[] = [
      'newest',
      'oldest',
      'label-asc',
      'label-desc',
    ]
    const input = [
      make('c', 'Charlie', 'testnet', '2024-03-01T00:00:00.000Z'),
      make('a', 'Alpha', 'mainnet', '2024-01-01T00:00:00.000Z'),
      make('b', 'Beta', 'mainnet', '2024-02-01T00:00:00.000Z'),
    ]
    for (const option of options) {
      expect(sortContracts(input, option)).toHaveLength(input.length)
    }
  })
})

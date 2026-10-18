import { WatchedContract } from '@/types'

export type SortOption = 'newest' | 'oldest' | 'label-asc' | 'label-desc'

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/**
 * Sort a list of watched contracts by the given option.
 *
 * Label sorting uses an `Intl.Collator` with `sensitivity: "base"` so that
 * ordering is case- and locale-aware, and falls back to `created_at` (then
 * `id`) as a stable tie-breaker so equal labels keep a deterministic order.
 */
export function sortContracts(
  contracts: WatchedContract[],
  sortBy: SortOption
): WatchedContract[] {
  const sorted = [...contracts]
  switch (sortBy) {
    case 'oldest':
      return sorted.sort((a, b) => a.created_at - b.created_at)
    case 'label-asc':
      return sorted.sort(
        (a, b) =>
          collator.compare(a.label, b.label) ||
          a.created_at - b.created_at ||
          a.id.localeCompare(b.id)
      )
    case 'label-desc':
      return sorted.sort(
        (a, b) =>
          collator.compare(b.label, a.label) ||
          a.created_at - b.created_at ||
          a.id.localeCompare(b.id)
      )
    case 'newest':
    default:
      return sorted.sort((a, b) => b.created_at - a.created_at)
  }
}

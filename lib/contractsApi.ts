import { apiFetch } from '@/lib/api'
import type { WatchedContract } from '@/types'

/**
 * ASSUMED tx-watch-core REST routes (not verified against the core repo):
 *   GET    /contracts        -> WatchedContract[]
 *   POST   /contracts        -> WatchedContract   (body: WatchedContract)
 *   PUT    /contracts/:id    -> WatchedContract   (body: WatchedContract)
 *   DELETE /contracts/:id    -> 204 / empty body
 * Contract objects use the same shape as the local WatchedContract type.
 */

export function isApiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_API_URL)
}

export function listContracts(): Promise<WatchedContract[]> {
  return apiFetch<WatchedContract[]>('/contracts')
}

export function createContract(
  contract: WatchedContract
): Promise<WatchedContract> {
  return apiFetch<WatchedContract>('/contracts', {
    method: 'POST',
    body: JSON.stringify(contract),
  })
}

export function updateContract(
  contract: WatchedContract
): Promise<WatchedContract> {
  return apiFetch<WatchedContract>(
    `/contracts/${encodeURIComponent(contract.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(contract),
    }
  )
}

export function removeContract(id: string): Promise<void> {
  return apiFetch<void>(`/contracts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

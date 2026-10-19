// @vitest-environment jsdom
import type { WatchedContract, AlertPayload } from '@/types'
import { saveContract, saveAlert, onContractsChange, onAlertsChange } from '../storage'

const contract = {
  id: 'c1', label: 'A', contract_id: 'C1', network: 'testnet', rules: [],
  webhook_url: 'https://example.com', created_at: 1, updated_at: 1,
} as unknown as WatchedContract
const alert = { contract_id: 'C1', timestamp: Date.now() } as unknown as AlertPayload

beforeEach(() => localStorage.clear())

describe('same-tab subscriptions', () => {
  it('notifies onContractsChange on saveContract in the same tab', () => {
    const cb = vi.fn()
    const off = onContractsChange(cb)
    saveContract(contract)
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    saveContract(contract)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('notifies onAlertsChange only for alert writes', () => {
    const cb = vi.fn()
    const off = onAlertsChange(cb)
    saveContract(contract)
    expect(cb).not.toHaveBeenCalled()
    saveAlert(alert)
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })
})
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { WatchedContract, Network, AlertRuleType, isAlertRuleType } from '@/types'
import { getContracts, getAlerts } from '@/lib/storage'
import { 
  refreshContracts, 
  syncDeleteContract, 
  syncSaveContract, 
  getSyncStatuses, 
  onSyncStatusesChange,
  type SyncStatus 
} from '@/lib/contractSync'
import { 
  loadContractPrefs, 
  saveContractPrefs, 
  resolveContractPrefs, 
  sortContracts, 
  SortOption, 
  ContractViewMode 
} from '@/lib/contractSort'
import ContractCard from '@/components/ContractCard'
import EmptyState from '@/components/EmptyState'
import ContractsSkeleton from '@/components/ContractsSkeleton'
import { useToast } from '@/components/ToastProvider'

type NetworkFilter = 'all' | Network
export type StatusFilter = 'all' | 'active' | 'paused'

const PAGE_SIZE = 12
const HIGHLIGHT_DURATION_MS = 6000

const NETWORK_LABELS: Record<Network, string> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet',
  futurenet: 'Futurenet',
}

const NETWORK_FILTERS: { value: NetworkFilter; label: string }[] = [
  { value: 'all', label: 'All Networks' },
  { value: 'mainnet', label: 'Mainnet' },
  { value: 'testnet', label: 'Testnet' },
  { value: 'futurenet', label: 'Futurenet' },
]

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
]

export const RULE_TYPE_OPTIONS: { type: AlertRuleType; label: string }[] = [
  { type: 'LargeTransfer', label: 'Large Transfer' },
  { type: 'AdminFunctionCalled', label: 'Admin Function' },
  { type: 'AnyTransaction', label: 'Any Transaction' },
  { type: 'FunctionCalled', label: 'Function Called' },
  { type: 'TransactionFailed', label: 'Transaction Failed' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'label-asc', label: 'Label A–Z' },
  { value: 'label-desc', label: 'Label Z–A' },
]

const VIEW_MODES: ContractViewMode[] = ['flat', 'grouped']

export default function ContractsClient() {
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  
  const [allContracts, setAllContracts] = useState<WatchedContract[]>([])
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({})
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>(() => {
    const net = searchParams?.get('network')
    return (net === 'mainnet' || net === 'testnet' || net === 'futurenet') ? net : 'all'
  })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = searchParams?.get('status')
    return (s === 'active' || s === 'paused') ? s : 'all'
  })
  const [selectedRuleTypes, setSelectedRuleTypes] = useState<AlertRuleType[]>(() => {
    const r = searchParams?.get('ruleTypes')
    if (!r) return []
    return r.split(',').filter(isAlertRuleType)
  })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [search, setSearch] = useState(() => searchParams?.get('q') ?? '')
  const [mounted, setMounted] = useState(false)
  const [viewMode, setViewMode] = useState<ContractViewMode>('flat')
  const [page, setPage] = useState(1)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const doRefresh = useCallback(async () => {
    setRefreshing(true)
    setBannerDismissed(false)
    try {
      const res = await refreshContracts()
      setAllContracts(res.contracts)
      if (res.error) {
        setRefreshError(res.error)
      } else {
        setRefreshError(null)
      }
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const all = getContracts()
    setAllContracts(all)
    setMounted(true)
    void doRefresh()
    
    setSyncStatuses(getSyncStatuses())
    return onSyncStatusesChange(() => {
      setSyncStatuses(getSyncStatuses())
    })
  }, [doRefresh])

  useEffect(() => {
    const initial = resolveContractPrefs({
      view: searchParams?.get('view'),
      sort: searchParams?.get('sort'),
    })
    setViewMode(initial.viewMode)
    setSortBy(initial.sortBy)
  }, [searchParams])

  useEffect(() => {
    try {
      const id = sessionStorage.getItem('txwatch_last_created_contract')
      if (id) {
        setHighlightedId(id)
        sessionStorage.removeItem('txwatch_last_created_contract')
        if (highlightTimer.current) clearTimeout(highlightTimer.current)
        highlightTimer.current = setTimeout(() => {
          setHighlightedId(null)
          highlightTimer.current = null
        }, HIGHLIGHT_DURATION_MS)
      }
    } catch {
      // ignore
    }
    return () => {
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current)
        highlightTimer.current = null
      }
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [networkFilter, statusFilter, selectedRuleTypes, search])

  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (networkFilter !== 'all') params.set('network', networkFilter)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (selectedRuleTypes.length > 0) params.set('ruleTypes', selectedRuleTypes.join(','))
    if (sortBy !== 'newest') params.set('sort', sortBy)
    if (viewMode !== 'flat') params.set('view', viewMode)

    const qs = params.toString()
    const newUrl = qs ? `/contracts?${qs}` : '/contracts'
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', newUrl)
    }
  }, [networkFilter, statusFilter, selectedRuleTypes, search, sortBy, viewMode, mounted])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return allContracts.filter((contract) => {
      if (networkFilter !== 'all' && contract.network !== networkFilter) {
        return false
      }

      const isPaused = contract.enabled === false
      if (statusFilter === 'active' && isPaused) return false
      if (statusFilter === 'paused' && !isPaused) return false

      if (selectedRuleTypes.length > 0) {
        const hasMatchingRule = contract.rules.some((r) =>
          selectedRuleTypes.includes(r.type)
        )
        if (!hasMatchingRule) return false
      }

      if (query) {
        const matches =
          contract.label.toLowerCase().includes(query) ||
          contract.contract_id.toLowerCase().includes(query)
        if (!matches) return false
      }

      return true
    })
  }, [allContracts, networkFilter, statusFilter, selectedRuleTypes, search])

  const sorted = useMemo(() => sortContracts(filtered, sortBy), [filtered, sortBy])
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, sorted]
  )

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  useEffect(() => {
    if (!highlightedId) return
    const index = sorted.findIndex((contract) => contract.id === highlightedId)
    if (index === -1) return
    const targetPage = Math.floor(index / PAGE_SIZE) + 1
    setPage((current) => (current === targetPage ? current : targetPage))
  }, [highlightedId, sorted])

  useEffect(() => {
    if (!highlightedId) return
    const el = document.getElementById(`contract-${highlightedId}`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightedId, page, paginated])

  const grouped = useMemo(() => {
    const groups: Record<Network, WatchedContract[]> = {
      mainnet: [],
      testnet: [],
      futurenet: [],
    }
    for (const contract of sorted) {
      groups[contract.network].push(contract)
    }
    return groups
  }, [sorted])

  const selectedContracts = useMemo(
    () => allContracts.filter((contract) => selectedIds.includes(contract.id)),
    [allContracts, selectedIds]
  )

  const selectedAlertCount = useMemo(() => {
    if (selectedIds.length === 0) return 0
    const alerts = getAlerts()
    return alerts.filter((alert) => selectedIds.includes(alert.contract_id)).length
  }, [selectedIds])

  const allPaginatedSelected =
    paginated.length > 0 && paginated.every((contract) => selectedIds.includes(contract.id))

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) setSelectedIds([])
      return !prev
    })
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    )
  }

  const toggleSelectPage = () => {
    if (allPaginatedSelected) {
      const paginatedIds = new Set(paginated.map((c) => c.id))
      setSelectedIds((prev) => prev.filter((id) => !paginatedIds.has(id)))
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const contract of paginated) next.add(contract.id)
        return Array.from(next)
      })
    }
  }

  const selectAllFiltered = () => {
    setSelectedIds(filtered.map(c => c.id))
  }

  const handleDeleteSelected = async () => {
    setConfirmOpen(false)
    setSelectionMode(false)

    const idsToDelete = [...selectedIds]
    setSelectedIds([])

    // Optimistic local UI removal
    setAllContracts((prev) => prev.filter((contract) => !idsToDelete.includes(contract.id)))

    const results = await Promise.allSettled(
      idsToDelete.map(id => syncDeleteContract(id))
    )

    let failCount = 0
    results.forEach((res) => {
      if (res.status === 'rejected' || (res.status === 'fulfilled' && !res.value.ok)) {
        failCount++
      }
    })

    if (failCount > 0) {
      showToast(`${failCount} of ${idsToDelete.length} could not be deleted on the server`, 'error')
      // Restore failed deletions from truth
      refreshContracts().then((r) => setAllContracts(r.contracts))
    } else {
      showToast(`Deleted ${idsToDelete.length} contract(s)`, 'success')
    }
  }

  const handlePauseSelected = () => {
    for (const id of selectedIds) {
      const contract = allContracts.find(c => c.id === id)
      if (contract) {
        syncSaveContract({ ...contract, enabled: false }, false)
      }
    }
    setAllContracts((prev) => prev.map((c) => selectedIds.includes(c.id) ? { ...c, enabled: false } : c))
    setSelectedIds([])
    setSelectionMode(false)
  }

  if (!mounted) return <ContractsSkeleton />

  const hasAnyContracts = allContracts.length > 0
  const hasFilteredContracts = filtered.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-100">Contracts</h1>
            {refreshing && (
              <span className="text-xs text-zinc-400 inline-flex items-center gap-1.5 ml-2" aria-live="polite">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Refreshing…
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">{filtered.length} registered</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-[260px] relative">
            <label htmlFor="contract-search" className="sr-only">
              Search contracts
            </label>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.5 10.5a7.5 7.5 0 0013.15 6.15z" />
              </svg>
            </span>
            <input
              id="contract-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by label or contract ID"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
            >
              Clear search
            </button>
          )}
        </div>
      </div>

      {refreshError && !bannerDismissed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>
              Showing cached contracts — couldn&apos;t reach the API ({refreshError})
            </span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => void doRefresh()}
              disabled={refreshing}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 transition-colors disabled:opacity-50"
            >
              {refreshing ? 'Retrying…' : 'Retry'}
            </button>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss banner"
              className="text-amber-400 hover:text-amber-200 p-0.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Network filter */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Network filter">
            {NETWORK_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setNetworkFilter(filter.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  networkFilter === filter.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Status filter toggle */}
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs" role="group" aria-label="Status filter">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatusFilter(s.value)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  statusFilter === s.value
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasAnyContracts && (
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => {
                  const next = e.target.value as SortOption
                  setSortBy(next)
                  saveContractPrefs({ viewMode, sortBy: next })
                }}
                className="appearance-none px-3 py-2 pr-8 rounded-lg bg-zinc-800 border border-zinc-700 text-sm font-medium text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
              >
                {SORT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-zinc-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit" role="group" aria-label="View mode">
            {VIEW_MODES.map((mode) => {
              const isActive = viewMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => {
                    setViewMode(mode)
                    saveContractPrefs({ viewMode: mode, sortBy })
                  }}
                  aria-pressed={isActive}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {mode === 'flat' ? 'Flat' : 'Grouped'}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={toggleSelectionMode}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              selectionMode
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
            }`}
          >
            {selectionMode ? 'Cancel' : 'Select'}
          </button>
        </div>
      </div>

      {/* Rule types multi-select filter */}
      <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Rule types filter">
        <span className="text-zinc-500 font-medium">Rules:</span>
        {RULE_TYPE_OPTIONS.map(({ type, label }) => {
          const isSelected = selectedRuleTypes.includes(type)
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                setSelectedRuleTypes((prev) =>
                  prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                )
              }}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                isSelected
                  ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500 font-medium'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700/60 hover:text-zinc-200 hover:border-zinc-600'
              }`}
            >
              {label}
            </button>
          )
        })}
        {selectedRuleTypes.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedRuleTypes([])}
            className="text-xs text-zinc-500 hover:text-zinc-300 ml-1 underline cursor-pointer"
          >
            Clear rules
          </button>
        )}
      </div>

      {selectionMode && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectPage}
                className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {allPaginatedSelected ? 'Deselect page' : 'Select page'}
              </button>
              <span className="text-sm text-zinc-400">{selectedIds.length} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePauseSelected}
                disabled={selectedIds.length === 0}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Pause selected
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={selectedIds.length === 0}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete selected
              </button>
            </div>
          </div>
          {allPaginatedSelected && selectedIds.length < filtered.length && viewMode === 'flat' && (
            <div className="text-sm text-zinc-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded flex items-center justify-center">
              <span>All {paginated.length} contracts on this page are selected.</span>
              <button type="button" onClick={selectAllFiltered} className="ml-2 text-indigo-400 font-medium hover:underline">
                Select all {filtered.length} matching contracts
              </button>
            </div>
          )}
        </div>
      )}

      {!hasAnyContracts ? (
        <EmptyState
          title="No contracts yet"
          description="Add a contract to start monitoring its activity."
          action={
            <Link
              href="/contracts/new"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Add contract
            </Link>
          }
        />
      ) : !hasFilteredContracts ? (
        <EmptyState
          title="No matching contracts"
          description="Try adjusting your search or filter."
          action={
            (networkFilter !== 'all' || statusFilter !== 'all' || selectedRuleTypes.length > 0 || search) ? (
              <button
                type="button"
                onClick={() => {
                  setNetworkFilter('all')
                  setStatusFilter('all')
                  setSelectedRuleTypes([])
                  setSearch('')
                }}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
              >
                Reset filters
              </button>
            ) : undefined
          }
        />
      ) : viewMode === 'grouped' ? (
        <div className="space-y-8">
          {(Object.keys(grouped) as Network[]).map((network) => {
            const contracts = grouped[network]
            if (contracts.length === 0) return null
            return (
              <section key={network} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  {NETWORK_LABELS[network]}
                  <span className="ml-2 text-zinc-600">{contracts.length}</span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {contracts.map((contract) => (
                    <ContractCard
                      key={contract.id}
                      contract={contract}
                      highlighted={contract.id === highlightedId}
                      selectionMode={selectionMode}
                      selected={selectedIds.includes(contract.id)}
                      onToggleSelected={toggleSelected}
                      syncStatus={syncStatuses[contract.id]}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paginated.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
              highlighted={contract.id === highlightedId}
              selectionMode={selectionMode}
              selected={selectedIds.includes(contract.id)}
              onToggleSelected={toggleSelected}
              syncStatus={syncStatuses[contract.id]}
            />
          ))}
        </div>
      )}

      {viewMode === 'flat' && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-100">Delete contracts</h2>
            <p className="text-sm text-zinc-400">
              Delete {selectedContracts.length} contract
              {selectedContracts.length === 1 ? '' : 's'} and {selectedAlertCount} alert
              {selectedAlertCount === 1 ? '' : 's'}? This cannot be undone.
            </p>
            <div className="max-h-32 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded p-2">
              <ul className="text-xs text-zinc-400 list-disc pl-4 space-y-1">
                {selectedContracts.map(c => (
                  <li key={c.id}>{c.label} <span className="text-zinc-600">({c.network})</span></li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
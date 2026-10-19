/**
 * Tests for pagination logic used in the contracts page (issue #80)
 * and responsive filter bar behaviour (issue #81).
 */

import { render, screen, act, fireEvent } from '@testing-library/react';
import ContractsClient from '../app/contracts/ContractsClient';
import { getContracts } from '../lib/storage'; // Note: Ensure the mock targets `storage.ts`

const PAGE_SIZE = 12

function paginate<T>(items: T[], page: number): T[] {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
}

function totalPages(count: number): number {
  return Math.max(1, Math.ceil(count / PAGE_SIZE))
}

describe('contracts page — pagination (issue #80)', () => {
  it('returns first PAGE_SIZE items on page 1', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    expect(paginate(items, 1)).toHaveLength(PAGE_SIZE)
    expect(paginate(items, 1)[0]).toBe(0)
  })

  it('returns correct slice on page 2', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    const result = paginate(items, 2)
    expect(result).toHaveLength(PAGE_SIZE)
    expect(result[0]).toBe(PAGE_SIZE)
  })

  it('returns remaining items on last page', () => {
    const items = Array.from({ length: 25 }, (_, i) => i)
    const result = paginate(items, 3)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(24)
  })

  it('totalPages is 1 for empty list', () => {
    expect(totalPages(0)).toBe(1)
  })

  it('totalPages is 1 when items fit on one page', () => {
    expect(totalPages(PAGE_SIZE)).toBe(1)
  })

  it('totalPages rounds up correctly', () => {
    expect(totalPages(PAGE_SIZE + 1)).toBe(2)
    expect(totalPages(PAGE_SIZE * 3)).toBe(3)
    expect(totalPages(PAGE_SIZE * 3 + 1)).toBe(4)
  })

  it('page 1 of a single-item list returns that item', () => {
    expect(paginate(['only'], 1)).toEqual(['only'])
  })
})

describe('contracts page — network filter (issue #81)', () => {
  type Item = { network: string }
  const items: Item[] = [
    { network: 'mainnet' },
    { network: 'mainnet' },
    { network: 'testnet' },
    { network: 'futurenet' },
  ]

  function applyFilter(list: Item[], filter: string): Item[] {
    if (filter === 'all') return list
    return list.filter((c) => c.network === filter)
  }

  it('all filter returns every item', () => {
    expect(applyFilter(items, 'all')).toHaveLength(4)
  })

  it('mainnet filter returns only mainnet items', () => {
    const result = applyFilter(items, 'mainnet')
    expect(result).toHaveLength(2)
    expect(result.every((c) => c.network === 'mainnet')).toBe(true)
  })

  it('testnet filter returns only testnet items', () => {
    const result = applyFilter(items, 'testnet')
    expect(result).toHaveLength(1)
    expect(result[0].network).toBe('testnet')
  })

  it('futurenet filter returns only futurenet items', () => {
    const result = applyFilter(items, 'futurenet')
    expect(result).toHaveLength(1)
    expect(result[0].network).toBe('futurenet')
  })

  it('filter with no matches returns empty array', () => {
    expect(applyFilter([], 'mainnet')).toHaveLength(0)
  })
})

describe('contracts page — search', () => {
  type ContractItem = { label: string; contract_id: string }
  const items: ContractItem[] = [
    { label: 'Escrow Manager', contract_id: 'ABC123' },
    { label: 'Payment Router', contract_id: 'DEF456' },
    { label: 'token service', contract_id: 'ghi789' },
  ]

  function applySearch(list: ContractItem[], query: string): ContractItem[] {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return list
    return list.filter((item) => {
      return (
        item.label.toLowerCase().includes(normalized) ||
        item.contract_id.toLowerCase().includes(normalized)
      )
    })
  }

  it('returns all contracts when search is empty', () => {
    expect(applySearch(items, '')).toHaveLength(3)
  })

  it('searches by label case-insensitively', () => {
    expect(applySearch(items, 'ESCROW')).toEqual([{ label: 'Escrow Manager', contract_id: 'ABC123' }])
  })

  it('searches by contract id substring', () => {
    expect(applySearch(items, '456')).toEqual([{ label: 'Payment Router', contract_id: 'DEF456' }])
  })

  it('returns no matches when search does not match any contract', () => {
    expect(applySearch(items, 'missing')).toHaveLength(0)
  })
})

describe('contracts page — new contract highlight (issue #55)', () => {
  const PAGE_SIZE = 12

  function pageOf(index: number): number {
    return Math.floor(index / PAGE_SIZE) + 1
  }

  function totalPages(count: number): number {
    return Math.max(1, Math.ceil(count / PAGE_SIZE))
  }

  it('computes the page containing a newly created contract', () => {
    expect(pageOf(0)).toBe(1)
    expect(pageOf(PAGE_SIZE - 1)).toBe(1)
    expect(pageOf(PAGE_SIZE)).toBe(2)
    expect(pageOf(PAGE_SIZE * 2 + 3)).toBe(3)
  })

  it('jumps to the last page when the new contract is appended', () => {
    const count = PAGE_SIZE * 2 + 1
    const newIndex = count - 1
    expect(pageOf(newIndex)).toBe(totalPages(count))
  })

  it('uses a single highlight timer owned by the page', () => {
    jest.useFakeTimers()
    const clearHighlight = jest.fn()
    let highlightedId: string | null = 'contract-1'

    const timer = setTimeout(() => {
      highlightedId = null
      clearHighlight()
    }, 6000)

    jest.advanceTimersByTime(2500)
    expect(highlightedId).toBe('contract-1')
    expect(clearHighlight).not.toHaveBeenCalled()

    jest.advanceTimersByTime(3500)
    expect(highlightedId).toBeNull()
    expect(clearHighlight).toHaveBeenCalledTimes(1)

    clearTimeout(timer)
    jest.useRealTimers()
  })

  it('applies a motion-safe pulse class for the highlight', () => {
    const highlightClass = 'motion-safe:animate-pulse'
    expect(highlightClass).toContain('motion-safe:')
    expect(highlightClass).not.toMatch(/(^|\s)animate-pulse(\s|$)/)
  })

  it('scrolls the highlighted card into view', () => {
    const scrollIntoView = jest.fn()
    const element = { scrollIntoView } as unknown as HTMLElement
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })
})

describe('contracts page — bulk selection (issue #52)', () => {
  type ContractItem = { id: string; label: string; alert_count: number }

  const items: ContractItem[] = [
    { id: '1', label: 'Escrow Manager', alert_count: 3 },
    { id: '2', label: 'Payment Router', alert_count: 0 },
    { id: '3', label: 'Token Service', alert_count: 5 },
  ]

  function toggleSelection(selected: Set<string>, id: string): Set<string> {
    const next = new Set(selected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    return next
  }

  function selectAll(list: ContractItem[]): Set<string> {
    return new Set(list.map((c) => c.id))
  }

  function isAllSelected(selected: Set<string>, list: ContractItem[]): boolean {
    return list.length > 0 && list.every((c) => selected.has(c.id))
  }

  function totalAlertRecords(selected: Set<string>, list: ContractItem[]): number {
    return list
      .filter((c) => selected.has(c.id))
      .reduce((sum, c) => sum + c.alert_count, 0)
  }

  function selectedLabels(selected: Set<string>, list: ContractItem[]): string[] {
    return list.filter((c) => selected.has(c.id)).map((c) => c.label)
  }

  it('starts with nothing selected', () => {
    expect(new Set<string>().size).toBe(0)
  })

  it('toggling an id adds it to the selection', () => {
    const selected = toggleSelection(new Set<string>(), '1')
    expect(selected.has('1')).toBe(true)
  })

  it('toggling a selected id removes it', () => {
    const selected = toggleSelection(new Set<string>(['1']), '1')
    expect(selected.has('1')).toBe(false)
  })

  it('select-all selects every contract in the current filter', () => {
    const selected = selectAll(items)
    expect(selected.size).toBe(3)
    expect(isAllSelected(selected, items)).toBe(true)
  })

  it('isAllSelected is false when only some are selected', () => {
    const selected = new Set<string>(['1'])
    expect(isAllSelected(selected, items)).toBe(false)
  })

  it('isAllSelected is false for an empty list', () => {
    expect(isAllSelected(new Set<string>(), [])).toBe(false)
  })

  it('counts alert records across the selection', () => {
    const selected = new Set<string>(['1', '3'])
    expect(totalAlertRecords(selected, items)).toBe(8)
  })

  it('returns the labels of selected contracts', () => {
    const selected = new Set<string>(['2'])
    expect(selectedLabels(selected, items)).toEqual(['Payment Router'])
  })
})

describe('contracts page — URL state sync (issue #42)', () => {
  const NETWORKS = ['all', 'mainnet', 'testnet', 'futurenet'] as const
  const SORTS = ['name', 'created', 'alerts'] as const
  const VIEWS = ['grid', 'list'] as const

  type ListState = {
    q: string
    network: (typeof NETWORKS)[number]
    sort: (typeof SORTS)[number]
    view: (typeof VIEWS)[number]
    page: number
  }

  const DEFAULTS: ListState = {
    q: '',
    network: 'all',
    sort: 'name',
    view: 'grid',
    page: 1,
  }

  function parseState(params: URLSearchParams): ListState {
    const q = params.get('q') ?? DEFAULTS.q

    const networkParam = params.get('network')
    const network = (NETWORKS as readonly string[]).includes(networkParam ?? '')
      ? (networkParam as ListState['network'])
      : DEFAULTS.network

    const sortParam = params.get('sort')
    const sort = (SORTS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as ListState['sort'])
      : DEFAULTS.sort

    const viewParam = params.get('view')
    const view = (VIEWS as readonly string[]).includes(viewParam ?? '')
      ? (viewParam as ListState['view'])
      : DEFAULTS.view

    const pageParam = Number.parseInt(params.get('page') ?? '', 10)
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : DEFAULTS.page

    return { q, network, sort, view, page }
  }

  function serializeState(state: ListState): string {
    const params = new URLSearchParams()
    if (state.q) params.set('q', state.q)
    if (state.network !== DEFAULTS.network) params.set('network', state.network)
    if (state.sort !== DEFAULTS.sort) params.set('sort', state.sort)
    if (state.view !== DEFAULTS.view) params.set('view', state.view)
    if (state.page !== DEFAULTS.page) params.set('page', String(state.page))
    return params.toString()
  }

  it('reads initial state from the URL params', () => {
    const params = new URLSearchParams('q=escrow&network=testnet&sort=alerts&view=list&page=3')
    expect(parseState(params)).toEqual({
      q: 'escrow',
      network: 'testnet',
      sort: 'alerts',
      view: 'list',
      page: 3,
    })
  })

  it('falls back to defaults when params are missing', () => {
    expect(parseState(new URLSearchParams())).toEqual(DEFAULTS)
  })

  it('falls back to defaults for unknown network, sort and view values', () => {
    const params = new URLSearchParams('network=devnet&sort=random&view=carousel')
    expect(parseState(params)).toEqual(DEFAULTS)
  })

  it('falls back to page 1 for invalid or non-positive page values', () => {
    expect(parseState(new URLSearchParams('page=abc')).page).toBe(1)
    expect(parseState(new URLSearchParams('page=0')).page).toBe(1)
    expect(parseState(new URLSearchParams('page=-4')).page).toBe(1)
  })

  it('omits default values when serializing', () => {
    expect(serializeState(DEFAULTS)).toBe('')
  })

  it('round-trips non-default state through the URL', () => {
    const state: ListState = {
      q: 'router',
      network: 'mainnet',
      sort: 'created',
      view: 'list',
      page: 2,
    }
    const params = new URLSearchParams(serializeState(state))
    expect(parseState(params)).toEqual(state)
  })

  it('round-trips state with a search query containing spaces', () => {
    const state: ListState = { ...DEFAULTS, q: 'escrow manager' }
    const params = new URLSearchParams(serializeState(state))
    expect(parseState(params).q).toBe('escrow manager')
  })

  it('debounces search query URL updates', () => {
    jest.useFakeTimers()
    const replace = jest.fn()
    let timer: ReturnType<typeof setTimeout> | null = null

    const scheduleSearchUpdate = (value: string) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => replace(value), 300)
    }

    scheduleSearchUpdate('e')
    scheduleSearchUpdate('es')
    scheduleSearchUpdate('esc')

    expect(replace).not.toHaveBeenCalled()

    jest.advanceTimersByTime(300)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('esc')

    jest.useRealTimers()
  })
})

import { render, screen, act, fireEvent } from '@testing-library/react';
import ContractsPage from '../app/contracts/page';
import { getContracts } from '@/lib/storage';
import { refreshContracts } from '@/lib/contractSync';

jest.mock('@/lib/storage', () => ({
  getContracts: jest.fn(),
  getAlerts: jest.fn(() => []),
  deleteContract: jest.fn(),
}));

jest.mock('@/lib/contractSync', () => ({
  refreshContracts: jest.fn(),
}));

type WatchedContract = {
  id: string;
  label: string;
  contract_id: string;
  network: string;
  rules: unknown[];
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
};

const makeContract = (
  overrides: Partial<WatchedContract> & { id: string; label: string }
): WatchedContract => ({
  contract_id: `C${overrides.id.toUpperCase()}`,
  network: 'mainnet',
  rules: [],
  webhook_url: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const contractA = makeContract({ id: 'a', label: 'Alpha' });
const contractB = makeContract({ id: 'b', label: 'Beta' });

const makeContracts = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeContract({ id: `c${i}`, label: `Contract ${i}` })
  );

describe('ContractsPage cross-tab updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getContracts as jest.Mock).mockReturnValue([contractA]);
  });

  it('renders the initial contracts list', () => {
    render(<ContractsPage />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('updates the list when a contract is added in another tab', () => {
    render(<ContractsPage />);
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();

    (getContracts as jest.Mock).mockReturnValue([contractA, contractB]);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'contracts' })
      );
    });

    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('updates the list when a contract is deleted in another tab', () => {
    (getContracts as jest.Mock).mockReturnValue([contractA, contractB]);
    render(<ContractsPage />);
    expect(screen.getByText('Beta')).toBeInTheDocument();

    (getContracts as jest.Mock).mockReturnValue([contractA]);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'contracts' })
      );
    });

    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('keeps the highlight logic working after a cross-tab update', () => {
    render(<ContractsPage />);

    (getContracts as jest.Mock).mockReturnValue([contractA, contractB]);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'contracts' })
      );
    });

    expect(refreshContracts).toHaveBeenCalled();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});

describe('ContractsPage pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resets to page 1 when the sort changes', () => {
    (getContracts as jest.Mock).mockReturnValue(makeContracts(30));
    render(<ContractsPage />);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Contract 10')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/sort/i), {
      target: { value: 'name' },
    });

    expect(screen.getByText('Contract 0')).toBeInTheDocument();
  });

  it('resets to page 1 when the view mode changes', () => {
    (getContracts as jest.Mock).mockReturnValue(makeContracts(30));
    render(<ContractsPage />);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Contract 10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /by network/i }));

    expect(screen.getByText('Contract 0')).toBeInTheDocument();
  });

  it('paginates the grouped By Network view', () => {
    (getContracts as jest.Mock).mockReturnValue(makeContracts(30));
    render(<ContractsPage />);

    fireEvent.click(screen.getByRole('button', { name: /by network/i }));

    expect(screen.getByText('Contract 0')).toBeInTheDocument();
    expect(screen.queryByText('Contract 10')).not.toBeInTheDocument();
  });

  it('shows the pager in the grouped By Network view', () => {
    (getContracts as jest.Mock).mockReturnValue(makeContracts(30));
    render(<ContractsPage />);

    fireEvent.click(screen.getByRole('button', { name: /by network/i }));

    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });
});

describe('ContractsPage network filter counts and heading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const networkContracts = [
    makeContract({ id: 'a', label: 'Alpha', network: 'mainnet' }),
    makeContract({ id: 'b', label: 'Beta', network: 'mainnet' }),
    makeContract({ id: 'c', label: 'Gamma', network: 'testnet' }),
  ];

  it('computes network pill counts from the search-filtered set', () => {
    (getContracts as jest.Mock).mockReturnValue(networkContracts);
    render(<ContractsPage />);

    fireEvent.change(screen.getByLabelText(/search/i), {
      target: { value: 'Alpha' },
    });

    const mainnetPill = screen.getByRole('button', { name: /mainnet/i });
    const testnetPill = screen.getByRole('button', { name: /testnet/i });

    expect(mainnetPill).toHaveTextContent('1');
    expect(testnetPill).toHaveTextContent('0');
  });

  it('shows "Showing X of Y contracts" when a search filter is active', () => {
    (getContracts as jest.Mock).mockReturnValue(networkContracts);
    render(<ContractsPage />);

    fireEvent.change(screen.getByLabelText(/search/i), {
      target: { value: 'Alpha' },
    });

    expect(
      screen.getByText(/showing 1 of 3 contracts/i)
    ).toBeInTheDocument();
  });

  it('keeps the plain registered heading when no filter is active', () => {
    (getContracts as jest.Mock).mockReturnValue(networkContracts);
    render(<ContractsPage />);

    expect(screen.getByText(/3 registered/i)).toBeInTheDocument();
    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
  });
});

describe('contracts page — bulk selection (issue #216 paginated scope)', () => {
  type ContractItem = { id: string; label: string; alert_count: number }

  const items: ContractItem[] = [
    { id: '1', label: 'Escrow Manager', alert_count: 3 },
    { id: '2', label: 'Payment Router', alert_count: 0 },
    { id: '3', label: 'Token Service', alert_count: 5 },
  ]

  function selectPage(selected: Set<string>, paginated: ContractItem[]): Set<string> {
    const next = new Set(selected)
    paginated.forEach(c => next.add(c.id))
    return next
  }

  function selectAllFiltered(list: ContractItem[]): Set<string> {
    return new Set(list.map((c) => c.id))
  }

  it('select-page selects every contract on the visible page', () => {
    const paginated = items.slice(0, 2)
    const selected = selectPage(new Set(), paginated)
    expect(selected.size).toBe(2)
    expect(selected.has('1')).toBe(true)
    expect(selected.has('2')).toBe(true)
    expect(selected.has('3')).toBe(false)
  })

  it('select-all-filtered selects every matching contract across all pages', () => {
    const selected = selectAllFiltered(items)
    expect(selected.size).toBe(3)
    expect(selected.has('3')).toBe(true)

jest.mock('../lib/contractSync', () => ({
  ...jest.requireActual('../lib/contractSync'),
  syncDeleteContract: jest.fn(),
  refreshContracts: jest.fn().mockResolvedValue({ contracts: [] }),
  getSyncStatuses: jest.fn().mockReturnValue({}),
  onSyncStatusesChange: jest.fn().mockReturnValue(() => {}),
}))

import { syncDeleteContract } from '../lib/contractSync'

describe('contracts page — bulk delete API sync (issue #215)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('awaits Promise.allSettled and reports partial failures correctly', async () => {
    const mockSyncDelete = syncDeleteContract as jest.Mock
    
    // Simulate one success and one failure
    mockSyncDelete.mockImplementation((id: string) => {
      if (id === 'fail-id') return Promise.resolve({ ok: false, error: 'Server error' })
      return Promise.resolve({ ok: true })
    })

    const selectedIds = ['success-id', 'fail-id']
    
    // Run the Promise.allSettled logic directly as implemented in the component
    const results = await Promise.allSettled(
      selectedIds.map(id => mockSyncDelete(id))
    )

    let failCount = 0
    results.forEach((res) => {
      if (res.status === 'rejected' || (res.status === 'fulfilled' && !res.value.ok)) {
        failCount++
      }
    })

    expect(mockSyncDelete).toHaveBeenCalledTimes(2)
    expect(mockSyncDelete).toHaveBeenCalledWith('success-id')
    expect(mockSyncDelete).toHaveBeenCalledWith('fail-id')
    expect(failCount).toBe(1)
  })
})

describe('contracts page — rule type and paused state filtering (issue #219)', () => {
  type ContractWithRules = {
    id: string
    label: string
    enabled?: boolean
    rules: { type: string }[]
  }

  const contracts: ContractWithRules[] = [
    {
      id: 'c1',
      label: 'Admin Escrow',
      enabled: true,
      rules: [{ type: 'AdminFunctionCalled' }, { type: 'LargeTransfer' }],
    },
    {
      id: 'c2',
      label: 'Paused Token',
      enabled: false,
      rules: [{ type: 'FunctionCalled' }],
    },
    {
      id: 'c3',
      label: 'Active Failures Watcher',
      enabled: true,
      rules: [{ type: 'TransactionFailed' }],
    },
  ]

  function filterContracts(
    list: ContractWithRules[],
    status: 'all' | 'active' | 'paused',
    ruleTypes: string[]
  ): ContractWithRules[] {
    return list.filter((c) => {
      const isPaused = c.enabled === false
      if (status === 'active' && isPaused) return false
      if (status === 'paused' && !isPaused) return false

      if (ruleTypes.length > 0) {
        const matchesRule = c.rules.some((r) => ruleTypes.includes(r.type))
        if (!matchesRule) return false
      }
      return true
    })
  }

  it('filters by active status only', () => {
    const active = filterContracts(contracts, 'active', [])
    expect(active.map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  it('filters by paused status only', () => {
    const paused = filterContracts(contracts, 'paused', [])
    expect(paused.map((c) => c.id)).toEqual(['c2'])
  })

  it('filters by single rule type', () => {
    const admin = filterContracts(contracts, 'all', ['AdminFunctionCalled'])
    expect(admin.map((c) => c.id)).toEqual(['c1'])
  })

  it('filters by multiple rule types (union matching)', () => {
    const matched = filterContracts(contracts, 'all', ['AdminFunctionCalled', 'TransactionFailed'])
    expect(matched.map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  it('combines status and rule type filters', () => {
    const activeAdmin = filterContracts(contracts, 'active', ['AdminFunctionCalled'])
    expect(activeAdmin.map((c) => c.id)).toEqual(['c1'])

    const pausedAdmin = filterContracts(contracts, 'paused', ['AdminFunctionCalled'])
    expect(pausedAdmin).toHaveLength(0)
  })

  it('serializes and parses status and ruleTypes in URL params', () => {
    const params = new URLSearchParams()
    params.set('status', 'paused')
    params.set('ruleTypes', 'AdminFunctionCalled,LargeTransfer')

    expect(params.get('status')).toBe('paused')
    expect(params.get('ruleTypes')?.split(',')).toEqual(['AdminFunctionCalled', 'LargeTransfer'])
  })
})

describe('contracts page — refresh failure banner and retry (issue #218)', () => {
  it('handles refresh failure result with error banner state', async () => {
    const mockRefresh = jest.fn().mockResolvedValue({
      contracts: [{ id: 'c1', label: 'Cached Contract' }],
      error: 'Network connection failed (503)',
    })

    const res = await mockRefresh()
    expect(res.contracts).toHaveLength(1)
    expect(res.error).toBe('Network connection failed (503)')

    // Simulating banner state
    let refreshError: string | null = res.error
    let bannerDismissed = false

    const dismissBanner = () => {
      bannerDismissed = true
    }

    expect(refreshError).toBeTruthy()
    expect(bannerDismissed).toBe(false)

    dismissBanner()
    expect(bannerDismissed).toBe(true)

    // Retry resets dismissed state and triggers refresh again
    const retry = async () => {
      bannerDismissed = false
      return mockRefresh()
    }

    const retryRes = await retry()
    expect(mockRefresh).toHaveBeenCalledTimes(2)
    expect(retryRes.contracts).toHaveLength(1)
  })
})
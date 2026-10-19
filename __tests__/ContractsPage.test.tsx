import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('../lib/storage', () => ({
  getContracts: jest.fn(),
  saveContracts: jest.fn(),
  subscribeToStorageChanges: jest.fn(),
}))

import * as storage from '../lib/storage'
import ContractsPage from '../app/contracts/page'

const mockedStorage = storage as jest.Mocked<typeof storage>

interface Contract {
  id: string
  name: string
  client: string
  value: number
  status: string
}

const makeContract = (id: number): Contract => ({
  id: `contract-${id}`,
  name: `Contract ${id}`,
  client: `Client ${id}`,
  value: id * 100,
  status: 'active',
})

const makeContracts = (count: number): Contract[] =>
  Array.from({ length: count }, (_, i) => makeContract(i + 1))

describe('ContractsPage', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    mockedStorage.getContracts.mockReturnValue([])
    mockedStorage.subscribeToStorageChanges.mockReturnValue(() => {})
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  describe('pagination helpers', () => {
    it('renders the first page of contracts', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(25))
      render(<ContractsPage />)

      expect(screen.getByText('Contract 1')).toBeInTheDocument()
      expect(screen.queryByText('Contract 25')).not.toBeInTheDocument()
    })

    it('advances to the next page when the next button is clicked', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(25))
      render(<ContractsPage />)

      fireEvent.click(screen.getByRole('button', { name: /next/i }))

      expect(screen.getByText('Contract 11')).toBeInTheDocument()
      expect(screen.queryByText('Contract 1')).not.toBeInTheDocument()
    })

    it('returns to the previous page when the previous button is clicked', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(25))
      render(<ContractsPage />)

      fireEvent.click(screen.getByRole('button', { name: /next/i }))
      fireEvent.click(screen.getByRole('button', { name: /previous/i }))

      expect(screen.getByText('Contract 1')).toBeInTheDocument()
    })

    it('disables the previous button on the first page', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(25))
      render(<ContractsPage />)

      expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    })

    it('disables the next button on the last page', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(15))
      render(<ContractsPage />)

      fireEvent.click(screen.getByRole('button', { name: /next/i }))

      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    })
  })

  describe('debounced search', () => {
    it('filters contracts after the debounce delay', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(5))
      render(<ContractsPage />)

      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'Contract 3' } })

      expect(screen.getByText('Contract 1')).toBeInTheDocument()

      act(() => {
        jest.advanceTimersByTime(300)
      })

      expect(screen.getByText('Contract 3')).toBeInTheDocument()
      expect(screen.queryByText('Contract 1')).not.toBeInTheDocument()
    })

    it('does not filter before the debounce delay elapses', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(5))
      render(<ContractsPage />)

      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'Contract 3' } })

      act(() => {
        jest.advanceTimersByTime(100)
      })

      expect(screen.getByText('Contract 1')).toBeInTheDocument()
    })

    it('resets to the first page when the search term changes', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(25))
      render(<ContractsPage />)

      fireEvent.click(screen.getByRole('button', { name: /next/i }))
      expect(screen.getByText('Contract 11')).toBeInTheDocument()

      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'Contract 1' } })

      act(() => {
        jest.advanceTimersByTime(300)
      })

      expect(screen.getByText('Contract 1')).toBeInTheDocument()
    })
  })

  describe('cross-tab storage-event updates', () => {
    it('subscribes to storage changes on mount', () => {
      render(<ContractsPage />)
      expect(mockedStorage.subscribeToStorageChanges).toHaveBeenCalledTimes(1)
    })

    it('refreshes contracts when a storage event is received', () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(2))
      render(<ContractsPage />)

      expect(screen.getByText('Contract 1')).toBeInTheDocument()

      mockedStorage.getContracts.mockReturnValue(makeContracts(3))

      const handler = mockedStorage.subscribeToStorageChanges.mock.calls[0][0]
      act(() => {
        handler()
      })

      expect(screen.getByText('Contract 3')).toBeInTheDocument()
    })

    it('unsubscribes from storage changes on unmount', () => {
      const unsubscribe = jest.fn()
      mockedStorage.subscribeToStorageChanges.mockReturnValue(unsubscribe)

      const { unmount } = render(<ContractsPage />)
      unmount()

      expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('updates the displayed list after an external storage update', async () => {
      mockedStorage.getContracts.mockReturnValue(makeContracts(1))
      render(<ContractsPage />)

      expect(screen.getByText('Contract 1')).toBeInTheDocument()

      mockedStorage.getContracts.mockReturnValue([
        ...makeContracts(1),
        makeContract(2),
      ])

      const handler = mockedStorage.subscribeToStorageChanges.mock.calls[0][0]
      act(() => {
        handler()
      })

      await waitFor(() => {
        expect(screen.getByText('Contract 2')).toBeInTheDocument()
      })
    })
  })
})

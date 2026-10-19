import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the freighter API module before importing the hooks.
vi.mock('@stellar/freighter-api', () => {
  return {
    isConnected: vi.fn(),
    getPublicKey: vi.fn(),
    getNetwork: vi.fn(),
    requestAccess: vi.fn(),
    setAllowed: vi.fn(),
  };
});

// Mock the lib/freighter helpers so we can control their results.
vi.mock('../lib/freighter', async () => {
  const actual = await vi.importActual<typeof import('../lib/freighter')>(
    '../lib/freighter'
  );
  return {
    ...actual,
    readFreighterConnection: vi.fn(),
    connectFreighter: vi.fn(),
  };
});

import * as freighterApi from '@stellar/freighter-api';
import {
  readFreighterConnection,
  connectFreighter,
  FreighterUnavailableError,
} from '../lib/freighter';
import { useFreighter } from '../lib/useFreighter';
import { useFreighterConnection } from '../lib/useFreighterConnection';

const mockedRead = vi.mocked(readFreighterConnection);
const mockedConnect = vi.mocked(connectFreighter);

describe('useFreighter', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('populates publicKey, network and isConnected from readFreighterConnection', async () => {
    mockedRead.mockResolvedValue({
      publicKey: 'GABC123',
      network: 'TESTNET',
      isConnected: true,
    });

    const { result } = renderHook(() => useFreighter());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.publicKey).toBe('GABC123');
    expect(result.current.network).toBe('TESTNET');
    expect(result.current.isConnected).toBe(true);
    expect(mockedRead).toHaveBeenCalledTimes(1);
  });

  it('reflects a disconnected state when readFreighterConnection reports no connection', async () => {
    mockedRead.mockResolvedValue({
      publicKey: null,
      network: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useFreighter());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.network).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('connect() updates state from connectFreighter', async () => {
    mockedRead.mockResolvedValue({
      publicKey: null,
      network: null,
      isConnected: false,
    });
    mockedConnect.mockResolvedValue({
      publicKey: 'GXYZ789',
      network: 'PUBLIC',
      isConnected: true,
    });

    const { result } = renderHook(() => useFreighter());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(result.current.publicKey).toBe('GXYZ789');
    expect(result.current.network).toBe('PUBLIC');
    expect(result.current.isConnected).toBe(true);
  });

  it('connect() surfaces FreighterUnavailableError by opening the install page', async () => {
    mockedRead.mockResolvedValue({
      publicKey: null,
      network: null,
      isConnected: false,
    });
    mockedConnect.mockRejectedValue(new FreighterUnavailableError());

    const { result } = renderHook(() => useFreighter());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    const openedUrl = String(openSpy.mock.calls[0][0]);
    expect(openedUrl).toContain('freighter');
    expect(result.current.isConnected).toBe(false);
  });
});

describe('useFreighterConnection', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('populates publicKey, network and isConnected from readFreighterConnection', async () => {
    mockedRead.mockResolvedValue({
      publicKey: 'GCONN456',
      network: 'FUTURENET',
      isConnected: true,
    });

    const { result } = renderHook(() => useFreighterConnection());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.publicKey).toBe('GCONN456');
    expect(result.current.network).toBe('FUTURENET');
    expect(result.current.isConnected).toBe(true);
    expect(mockedRead).toHaveBeenCalledTimes(1);
  });

  it('reflects a disconnected state when readFreighterConnection reports no connection', async () => {
    mockedRead.mockResolvedValue({
      publicKey: null,
      network: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useFreighterConnection());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.network).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('connect() updates state from connectFreighter', async () => {
    mockedRead.mockResolvedValue({
      publicKey: null,
      network: null,
      isConnected: false,
    });
    mockedConnect.mockResolvedValue({
      publicKey: 'GNEW111',
      network: 'TESTNET',
      isConnected: true,
    });

    const { result } = renderHook(() => useFreighterConnection());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(result.current.publicKey).toBe('GNEW111');
    expect(result.current.network).toBe('TESTNET');
    expect(result.current.isConnected).toBe(true);
  });

  it('connect() surfaces FreighterUnavailableError by opening the install page', async () => {
    mockedRead.mockResolvedValue({
      publicKey: null,
      network: null,
      isConnected: false,
    });
    mockedConnect.mockRejectedValue(new FreighterUnavailableError());

    const { result } = renderHook(() => useFreighterConnection());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    const openedUrl = String(openSpy.mock.calls[0][0]);
    expect(openedUrl).toContain('freighter');
    expect(result.current.isConnected).toBe(false);
  });
});
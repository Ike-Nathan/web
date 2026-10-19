import { render, screen, act } from '@testing-library/react';
import React from 'react';

jest.mock('@/hooks/useWalletState', () => {
  const listeners = new Set<(publicKey: string | null) => void>();
  let currentPublicKey: string | null = null;

  const broadcastWalletChange = (publicKey: string | null) => {
    currentPublicKey = publicKey;
    listeners.forEach((listener) => listener(publicKey));
  };

  const useWalletState = () => {
    const [publicKey, setPublicKey] = React.useState<string | null>(currentPublicKey);

    React.useEffect(() => {
      const listener = (nextPublicKey: string | null) => setPublicKey(nextPublicKey);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }, []);

    return {
      publicKey,
      isConnected: publicKey !== null,
    };
  };

  return { useWalletState, broadcastWalletChange };
});

import { useWallet } from '@/lib/useWallet';
import { broadcastWalletChange } from '@/hooks/useWalletState';

function WalletStatus() {
  const { isConnected } = useWallet();
  return <div data-testid="status">{isConnected ? 'connected' : 'disconnected'}</div>;
}

describe('useWallet', () => {
  it('isConnected follows wallet broadcast events', () => {
    render(<WalletStatus />);

    expect(screen.getByTestId('status')).toHaveTextContent('disconnected');

    act(() => {
      broadcastWalletChange('GABC123PUBLICKEY');
    });

    expect(screen.getByTestId('status')).toHaveTextContent('connected');

    act(() => {
      broadcastWalletChange(null);
    });

    expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
  });
});
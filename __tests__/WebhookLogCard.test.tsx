import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhookLogCard, WebhookEntry } from '../components/WebhookLogCard';
import { AlertPayload } from '../types';

const base: WebhookEntry = {
  id: '1',
  timestamp: '2024-03-15T10:00:00Z',
  event: 'transfer',
  status: 'success',
};

const baseAlert: AlertPayload = {
  label: 'Test Contract',
  contract_id: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5CWK',
  network: 'testnet',
  rule_triggered: 'LargeTransfer',
  transaction_hash: 'abc123def4567890abc123def4567890',
  timestamp: new Date('2024-03-15T10:00:00Z').getTime(),
  amount: 250,
};

describe('WebhookLogCard', () => {
  it('renders event name', () => {
    render(<WebhookLogCard entry={base} />);
    expect(screen.getByText('transfer')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<WebhookLogCard entry={base} />);
    expect(screen.getByText('success')).toBeInTheDocument();
  });

  it('renders failed status badge with correct class', () => {
    render(<WebhookLogCard entry={{ ...base, status: 'failed' }} />);
    const badge = screen.getByText('failed');
    expect(badge.className).toContain('red');
  });

  it('shows contract address when provided', () => {
    const addr = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE';
    render(<WebhookLogCard entry={{ ...base, contractAddress: addr }} />);
    expect(screen.getByText(/Contract:/)).toBeInTheDocument();
  });

  it('omits contract section when not provided', () => {
    render(<WebhookLogCard entry={base} />);
    expect(screen.queryByText(/Contract:/)).not.toBeInTheDocument();
  });

  it('shows amount and asset when provided', () => {
    render(<WebhookLogCard entry={{ ...base, amount: '100', asset: 'XLM' }} />);
    expect(screen.getByText(/Amount:/)).toBeInTheDocument();
    expect(screen.getByText(/XLM/)).toBeInTheDocument();
  });

  it('renders tx hash link with explorer href', () => {
    const hash = 'abc123def456';
    render(<WebhookLogCard entry={{ ...base, txHash: hash }} />);
    const link = screen.getByRole('link', { name: /View transaction/ });
    expect(link).toHaveAttribute('href', expect.stringContaining(hash));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('links to the mainnet explorer by default', () => {
    const hash = 'abc123def456';
    render(<WebhookLogCard entry={{ ...base, txHash: hash }} />);
    const link = screen.getByRole('link', { name: /View transaction/ });
    expect(link).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/public/tx/${hash}`,
    );
  });

  it('links to the testnet explorer when network is testnet', () => {
    const hash = 'abc123def456';
    render(<WebhookLogCard entry={{ ...base, txHash: hash }} network="testnet" />);
    const link = screen.getByRole('link', { name: /View transaction/ });
    expect(link).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/tx/${hash}`,
    );
  });

  it('links to the futurenet explorer when network is futurenet', () => {
    const hash = 'abc123def456';
    render(<WebhookLogCard entry={{ ...base, txHash: hash }} network="futurenet" />);
    const link = screen.getByRole('link', { name: /View transaction/ });
    expect(link).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/futurenet/tx/${hash}`,
    );
  });

  it('omits tx section when txHash not provided', () => {
    render(<WebhookLogCard entry={base} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders correctly from an AlertPayload prop', () => {
    render(<WebhookLogCard alert={baseAlert} network="testnet" />);
    expect(screen.getByText('LargeTransfer')).toBeInTheDocument();
    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View transaction/ })).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/tx/${baseAlert.transaction_hash}`,
    );
  });

  it('calls custom onClick prop when clicked', () => {
    const onClick = vi.fn();
    render(<WebhookLogCard alert={baseAlert} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Webhook event LargeTransfer/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('opens Modal detail when clicked without custom onClick', () => {
    render(<WebhookLogCard alert={baseAlert} />);
    fireEvent.click(screen.getByRole('button', { name: /Webhook event LargeTransfer/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Alert Detail')).toBeInTheDocument();
    expect(screen.getByText('Copy JSON')).toBeInTheDocument();
    expect(screen.getByText('Open in explorer')).toBeInTheDocument();
  });
});


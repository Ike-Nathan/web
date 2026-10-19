'use client';

import React, { useCallback, useState } from 'react';
import { formatAmount } from '@/lib/formatAmount';
import { truncateId } from '@/lib/stellar';
import { formatDateTime } from '@/lib/format';
import { explorerContractUrl, explorerTxUrl } from '@/lib/explorer';

export interface WebhookEntry {
  id: string;
  timestamp: string;
  event: string;
  contractAddress?: string;
  status: 'success' | 'failed' | 'pending';
  amount?: string;
  asset?: string;
  txHash?: string;
  payload?: Record<string, unknown>;
}

interface WebhookLogCardProps {
  entry: WebhookEntry;
  network?: string;
}

const STATUS_STYLES: Record<WebhookEntry['status'], string> = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

function buildPayload(entry: WebhookEntry): Record<string, unknown> {
  if (entry.payload) return entry.payload;
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    event: entry.event,
    status: entry.status,
    ...(entry.contractAddress ? { contractAddress: entry.contractAddress } : {}),
    ...(entry.amount ? { amount: entry.amount } : {}),
    ...(entry.asset ? { asset: entry.asset } : {}),
    ...(entry.txHash ? { txHash: entry.txHash } : {}),
  };
}

export function WebhookLogCard({ entry, network }: WebhookLogCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const payload = buildPayload(entry);
  const json = JSON.stringify(payload, null, 2);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    [open],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [json]);

  const txHref = entry.txHash ? explorerTxUrl(network, entry.txHash) : null;
  const explorerHref =
    txHref ??
    (entry.contractAddress ? explorerContractUrl(network, entry.contractAddress) : null);

  return (
    <>
      <article
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={handleKeyDown}
        className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3 cursor-pointer transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Webhook event ${entry.event} at ${entry.timestamp}. Open details.`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-sm text-foreground break-all">
            {entry.event}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[entry.status]}`}
          >
            {entry.status}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-label="Time" title={formatDateTime(entry.timestamp)}>{formatDateTime(entry.timestamp)}</span>
        </div>

        {entry.contractAddress && (
          <div className="text-xs">
            <span className="text-muted-foreground">Contract: </span>
            <span className="font-mono break-all text-foreground">
              {truncateId(entry.contractAddress, 6)}
            </span>
          </div>
        )}

        {entry.amount && (
          <div className="text-xs">
            <span className="text-muted-foreground">Amount: </span>
            <span className="font-medium text-foreground">
              {formatAmount(entry.amount)} {entry.asset ?? ''}
            </span>
          </div>
        )}

        {entry.txHash && (
          <div className="text-xs">
            <span className="text-muted-foreground">Tx: </span>
            {txHref ? (
              <a
                href={txHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-mono text-primary hover:underline break-all"
                aria-label={`View transaction ${entry.txHash} on Stellar Explorer`}
              >
                {truncateId(entry.txHash)}
              </a>
            ) : (
              <span className="font-mono break-all">{truncateId(entry.txHash)}</span>
            )}
          </div>
        )}
      </article>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`Alert detail for ${entry.event}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={close}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">
                Alert Detail
              </h2>
              <button
                type="button"
                onClick={close}
                autoFocus
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Close detail drawer"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs font-mono text-foreground">
                {json}
              </pre>
            </div>

            <div className="flex items-center gap-2 border-t border-border p-4">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
              {explorerHref && (
                <a
                  href={explorerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Open in explorer
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default WebhookLogCard;

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { exportAllStorageData, clearTxWatchStorage } from '@/lib/storage';
import { getLastStorageError } from '@/lib/storageLogger';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isStorageError = error.message?.includes('storage') ||
    error.message?.includes('JSON') ||
    error.message?.includes('parse');

  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleDownloadBackup = () => {
    try {
      const data = exportAllStorageData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `txwatch-backup-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export storage data:', e);
    }
  };

  const handleConfirmReset = () => {
    try {
      const lastError = getLastStorageError();
      if (lastError?.key) {
        try {
          localStorage.removeItem(lastError.key);
        } catch (e) {
          console.error('Failed to remove corrupted key:', e);
          clearTxWatchStorage();
        }
      } else {
        clearTxWatchStorage();
      }
    } catch (e) {
      console.error('Failed to clear storage:', e);
    } finally {
      setConfirmingReset(false);
      reset();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Oops!</h1>
          <p className="text-muted-foreground">
            {isStorageError
              ? 'Something went wrong with your stored data.'
              : 'Something went wrong. Please try again.'}
          </p>
          {error.message && (
            <p className="text-sm text-muted-foreground/60 font-mono break-words">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {isStorageError && !confirmingReset && (
            <>
              <button
                onClick={handleDownloadBackup}
                className="px-4 py-2 border border-border text-foreground rounded-lg font-medium hover:bg-muted transition-colors"
              >
                Download backup
              </button>
              <button
                onClick={() => setConfirmingReset(true)}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:bg-destructive/90 transition-colors"
              >
                Reset Local Data
              </button>
            </>
          )}

          {isStorageError && confirmingReset && (
            <div className="space-y-3 rounded-lg border border-destructive/50 p-4">
              <p className="text-sm text-muted-foreground">
                This will remove TxWatch data from this browser. Make sure you
                have downloaded a backup first. This cannot be undone.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleConfirmReset}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:bg-destructive/90 transition-colors"
                >
                  Yes, reset TxWatch data
                </button>
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="px-4 py-2 border border-border text-foreground rounded-lg font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>

          <Link
            href="/"
            className="px-4 py-2 border border-border text-foreground rounded-lg font-medium hover:bg-muted transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

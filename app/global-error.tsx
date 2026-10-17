'use client';

import './globals.css';
import { useState } from 'react';
import {
  clearTxWatchStorage,
  downloadTxWatchBackup,
  getCorruptedStorageKey,
} from '@/lib/storageLogger';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const handleDownloadBackup = () => {
    try {
      downloadTxWatchBackup();
    } catch {
      // Ignore backup failures; the user can still proceed with reset.
    }
  };

  const handleReset = () => {
    try {
      clearTxWatchStorage(getCorruptedStorageKey() ?? undefined);
    } catch {
      // Ignore storage failures; still attempt to restart the app.
    }
    setResetDone(true);
    setConfirmingReset(false);
    reset();
  };

  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Critical Error</h1>
              <p className="text-muted-foreground">
                A critical error occurred. The application needs to restart.
              </p>
              {error.message && (
                <p className="text-sm text-muted-foreground/60 font-mono break-words">
                  {error.message}
                </p>
              )}
            </div>

            <button
              onClick={() => reset()}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Restart Application
            </button>

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                If the problem persists, you can back up your data and reset
                TxWatch&apos;s local storage.
              </p>

              <button
                onClick={handleDownloadBackup}
                className="w-full px-4 py-2 border border-border rounded-lg font-medium hover:bg-muted transition-colors"
              >
                Download backup
              </button>

              {!confirmingReset ? (
                <button
                  onClick={() => setConfirmingReset(true)}
                  className="w-full px-4 py-2 border border-destructive/50 text-destructive rounded-lg font-medium hover:bg-destructive/10 transition-colors"
                >
                  Reset Local Data
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">
                    This will remove TxWatch&apos;s stored data from this
                    browser. Download a backup first if you need it. Continue?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleReset}
                      className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:bg-destructive/90 transition-colors"
                    >
                      Yes, reset
                    </button>
                    <button
                      onClick={() => setConfirmingReset(false)}
                      className="flex-1 px-4 py-2 border border-border rounded-lg font-medium hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {resetDone && (
                <p className="text-sm text-muted-foreground">
                  Local data has been reset.
                </p>
              )}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
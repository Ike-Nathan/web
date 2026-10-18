'use client';

import React, { useState, useId } from 'react';

export type StellarNetwork = 'mainnet' | 'testnet' | 'futurenet';

interface NetworkEditFieldProps {
  currentNetwork: StellarNetwork;
  onNetworkChange: (network: StellarNetwork) => void | Promise<void>;
  disabled?: boolean;
  checkDuplicate?: (network: StellarNetwork) => boolean | Promise<boolean>;
  onAlertHistoryCleared?: (network: StellarNetwork) => void | Promise<void>;
}

const NETWORK_OPTIONS: { value: StellarNetwork; label: string }[] = [
  { value: 'mainnet',   label: 'Mainnet (Public)' },
  { value: 'testnet',   label: 'Testnet'          },
  { value: 'futurenet', label: 'Futurenet'        },
];

const CAUTION_MESSAGES: Record<StellarNetwork, string> = {
  mainnet:
    'Switching to Mainnet: alert rules and duplicate-detection history are network-scoped. ' +
    'Existing alerts may not match mainnet transactions until re-evaluated.',
  testnet:
    'Switching to Testnet: this contract will no longer watch mainnet activity. ' +
    'Duplicate-detection context will reset.',
  futurenet:
    'Switching to Futurenet: this is an experimental network. ' +
    'Alert history and duplicate detection will be cleared.',
};

export function NetworkEditField({
  currentNetwork,
  onNetworkChange,
  disabled = false,
  checkDuplicate,
  onAlertHistoryCleared,
}: NetworkEditFieldProps) {
  const idPrefix = useId();
  const [editing, setEditing]         = useState(false);
  const [pendingNetwork, setPending]  = useState<StellarNetwork | null>(null);
  const [saving, setSaving]           = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = e.target.value as StellarNetwork;
    if (selected === currentNetwork) {
      setPending(null);
      setShowWarning(false);
      setError(null);
      return;
    }
    setError(null);
    setPending(selected);
    setShowWarning(true);
  }

  async function handleConfirm() {
    if (!pendingNetwork) return;
    setSaving(true);
    setError(null);
    try {
      if (checkDuplicate) {
        const isDuplicate = await checkDuplicate(pendingNetwork);
        if (isDuplicate) {
          setError(
            `A contract with this contract ID already exists on ${pendingNetwork}. ` +
              'Choose a different network or remove the duplicate first.',
          );
          setSaving(false);
          return;
        }
      }
      await onNetworkChange(pendingNetwork);
      if (onAlertHistoryCleared) {
        await onAlertHistoryCleared(pendingNetwork);
      }
      setShowWarning(false);
      setPending(null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network change failed.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setPending(null);
    setShowWarning(false);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-100 capitalize">
          {currentNetwork}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-indigo-400 hover:underline"
            aria-label="Edit network"
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={pendingNetwork ?? currentNetwork}
          onChange={handleSelectChange}
          disabled={saving}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Select network"
        >
          {NETWORK_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCancel}
          className="text-xs text-zinc-400 hover:text-zinc-200"
          aria-label="Cancel network edit"
        >
          Cancel
        </button>
      </div>

      {showWarning && pendingNetwork && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={`${idPrefix}-network-warning-title`}
          aria-describedby={`${idPrefix}-network-warning-desc`}
          className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 space-y-3"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden="true" className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
            <div>
              <p
                id={`${idPrefix}-network-warning-title`}
                className="text-sm font-semibold text-amber-500"
              >
                Network change warning
              </p>
              <p
                id={`${idPrefix}-network-warning-desc`}
                className="mt-1 text-xs text-amber-200/80"
              >
                {CAUTION_MESSAGES[pendingNetwork]}
              </p>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Keep current
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              aria-label={`Confirm switch to ${pendingNetwork}`}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Switch to ${pendingNetwork}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NetworkEditField;
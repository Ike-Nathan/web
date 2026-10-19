'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WatchedContract, AlertPayload, AlertRule, isRuleEnabled } from '@/types'
import { syncSaveContract, syncDeleteContract } from '@/lib/contractSync'
import { getContract, deleteContract, getAlerts, saveContract, seedMockAlerts, getContracts } from '@/lib/storage'
import { truncateId, explorerContractUrl, isValidUrl, mapFreighterNetwork } from '@/lib/stellar'
import { getContract, getAlerts, getContractByIdAndNetwork, getContracts } from '@/lib/storage'
import { truncateId, explorerContractUrl, isValidUrl, mapFreighterNetwork } from '@/lib/stellar'
import { formatDate, formatRelativeTime, formatRuleSummary, maskWebhookUrl } from '@/lib/format'
import { useAnalytics } from '@/lib/useAnalytics'
import { useNow } from '@/lib/useNow'
import { formatDate, formatRuleSummary } from '@/lib/format'
import { useAnalytics } from '@/lib/useAnalytics'
import { useToast } from '@/components/ToastProvider'
import NetworkBadge from '@/components/NetworkBadge'
import NetworkEditField from '@/components/NetworkEditField'
import AlertRuleBadge from '@/components/AlertRuleBadge'
import WebhookLog from '@/components/WebhookLog'
import RuleBuilder from '@/components/RuleBuilder'
import CopyButton from '@/components/CopyButton'
import NotificationToggle from '@/components/NotificationToggle'
import Modal from '@/components/Modal'
import { notifyNewAlerts } from '@/lib/notifications'
import { useAlertSync } from '@/hooks/useAlertSync'

export default function ContractDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { trackEvent } = useAnalytics()
  const { showToast } = useToast()
  const now = useNow(60_000)
  const [contract, setContract] = useState<WatchedContract | null>(null)
  const [alerts, setAlerts] = useState<AlertPayload[]>([])
  const [mounted, setMounted] = useState(false)
  const [contractNotFound, setContractNotFound] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showEditRules, setShowEditRules] = useState(false)
  const [editedRules, setEditedRules] = useState<AlertRule[]>([])
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
  
  // Metadata editing state
  const [showEditMetadata, setShowEditMetadata] = useState(false)
  const [editedLabel, setEditedLabel] = useState('')
  const [editedWebhookUrl, setEditedWebhookUrl] = useState('')
  const [editedNetwork, setEditedNetwork] = useState<WatchedContract['network']>('testnet')
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [editedLabelWarning, setEditedLabelWarning] = useState<string | null>(null)

  const sync = useAlertSync(contract?.contract_id, contract?.network, (fresh) => {
    setAlerts(getAlerts(contract?.contract_id ?? params.id))
    notifyNewAlerts(fresh, contract?.label ?? params.id, `/contracts/${params.id}`)
  })

  useEffect(() => {
    const c = getContract(params.id)
    if (!c) { 
      setContractNotFound(true)
      setMounted(true)
      return 
    }
    setContract(c)
    setAlerts(getAlerts(c.contract_id))
    setMounted(true)
  }, [params.id, router])

  const [walletNetworkMismatch, setWalletNetworkMismatch] = useState<string | null>(null)

  useEffect(() => {
    async function checkWalletNetwork() {
      if (typeof window === 'undefined' || !window.freighter || !contract) return
      try {
        const connected = await window.freighter.isConnected()
        if (!connected) {
          setWalletNetworkMismatch(null)
          return
        }
        const rawNet = await window.freighter.getNetwork()
        const mappedNet = mapFreighterNetwork(rawNet)
        if (mappedNet && mappedNet !== contract.network) {
          setWalletNetworkMismatch(
            `Wallet is on ${rawNet}, but this contract is monitored on ${contract.network.toUpperCase()}`
          )
        } else {
          setWalletNetworkMismatch(null)
        }
      } catch {
        setWalletNetworkMismatch(null)
      }
    }

    checkWalletNetwork()

    const onSync = () => {
      if (!document.hidden) checkWalletNetwork()
    }
    window.addEventListener('focus', onSync)
    document.addEventListener('visibilitychange', onSync)
    return () => {
      window.removeEventListener('focus', onSync)
      document.removeEventListener('visibilitychange', onSync)
    }
  }, [contract])

  function handleDelete() {
    trackEvent('contract_deleted', { contractId: params.id })
    void syncDeleteContract(params.id)
    router.push('/contracts')
  }

  function openEditRules() {
    setEditedRules(contract!.rules)
    setRulesError(null)
    setShowEditRules(true)
    trackEvent('rule_edit_opened', { contractId: params.id, ruleCount: contract!.rules.length })
  }

  async function saveRules() {
    if (editedRules.length === 0) { setRulesError('Add at least one rule'); return }
    const updated = { ...contract!, rules: editedRules }
    const { saved, syncPromise } = syncSaveContract(updated, false)
    const { saved, sync } = syncSaveContract(updated, false)
    if (!saved) {
      setRulesError('Could not save: browser storage is full or conflict occurred')
      return
    }
    setContract(updated)
    setShowEditRules(false)
    trackEvent('rule_edit_saved', { contractId: params.id, ruleCount: editedRules.length })
    
    const result = await syncPromise
    const result = await sync
    if (!result.ok) showToast(result.error || 'API Sync Error', 'error')
  }

  async function toggleRule(index: number) {
    const rules = contract!.rules.map((r, i) => (i === index ? { ...r, enabled: !isRuleEnabled(r) } : r))
    const updated = { ...contract!, rules }
    const { saved, syncPromise } = syncSaveContract(updated, false)
    if (!saved) return
    setContract(updated)

    const result = await syncPromise
    const { saved, sync } = syncSaveContract(updated, false)
    if (!saved) return
    setContract(updated)

    const result = await sync
    if (!result.ok) showToast(result.error || 'API Sync Error', 'error')
  }

  async function toggleContractPause() {
    const isEnabled = contract?.enabled ?? true
    const updated = { ...contract!, enabled: !isEnabled }
    const { saved, syncPromise } = syncSaveContract(updated, false)
    if (!saved) return
    setContract(updated)

    trackEvent(updated.enabled ? 'contract_resumed' : 'contract_paused', { contractId: params.id })

    const result = await syncPromise
    const { saved, sync } = syncSaveContract(updated, false)
    if (!saved) return
    setContract(updated)

    const result = await sync
    if (!result.ok) showToast(result.error || 'API Sync Error', 'error')
  }

  function hasUnsavedChanges(): boolean {
    return JSON.stringify(editedRules) !== JSON.stringify(contract?.rules ?? [])
  }

  function handleCancelEdit() {
    if (hasUnsavedChanges()) {
      setShowUnsavedWarning(true)
    } else {
      trackEvent('rule_edit_cancelled', { contractId: params.id })
      setShowEditRules(false)
    }
  }

  function confirmDiscard() {
    setShowUnsavedWarning(false)
    setShowEditRules(false)
    trackEvent('rule_edit_cancelled', { contractId: params.id })
  }

  function openEditMetadata() {
    setEditedLabel(contract!.label)
    setEditedWebhookUrl(contract!.webhook_url)
    setEditedNetwork(contract!.network)
    setMetadataError(null)
    setEditedLabelWarning(null)
    setShowEditMetadata(true)
    trackEvent('metadata_edit_opened', { contractId: params.id })
  }

  async function saveMetadata() {
    const trimmedLabel = editedLabel.trim()
    const trimmedWebhookUrl = editedWebhookUrl.trim()

    if (!trimmedLabel) { setMetadataError('Label is required'); return }
    if (trimmedLabel.length > 100) { setMetadataError('Label must be 100 characters or less'); return }
    if (!trimmedWebhookUrl) { setMetadataError('Webhook URL is required'); return }
    if (!isValidUrl(trimmedWebhookUrl)) { setMetadataError('Please enter a valid HTTP or HTTPS URL'); return }

    const networkChanged = editedNetwork !== contract!.network

    if (networkChanged) {
      const existing = getContractByIdAndNetwork(contract!.contract_id, editedNetwork)
      if (existing) {
        setMetadataError('A contract with this ID already exists on the selected network')
        return
      }
    }

    const updated = { 
      ...contract!, 
      label: trimmedLabel,
      webhook_url: trimmedWebhookUrl,
      network: editedNetwork
    }
    const { saved, syncPromise } = syncSaveContract(updated, false)
    const { saved, sync } = syncSaveContract(updated, false)
    if (!saved) {
      setMetadataError('Could not save: browser storage is full or conflict occurred')
      return
    }

    if (networkChanged) {
      setAlerts([])
      trackEvent('network_switched', { contractId: params.id, network: editedNetwork })
    }

    setContract(updated)
    setShowEditMetadata(false)
    trackEvent('metadata_edit_saved', { contractId: params.id })

    const result = await syncPromise
    const result = await sync
    if (!result.ok) showToast(result.error || 'API Sync Error', 'error')
  }

  function hasMetadataChanges(): boolean {
    return editedLabel !== contract?.label || editedWebhookUrl !== contract?.webhook_url || editedNetwork !== contract?.network
  }

  function handleCancelMetadataEdit() {
    if (hasMetadataChanges()) {
      setShowUnsavedWarning(true)
    } else {
      setShowEditMetadata(false)
    }
  }

  if (!mounted) return null

  if (contractNotFound) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-sm">
          <div className="flex justify-center">
            <svg className="w-16 h-16 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-zinc-100">Contract Not Found</h2>
          <p className="text-sm text-zinc-400">
            The contract you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <button
            onClick={() => router.push('/contracts')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Contracts
          </button>
        </div>
      </div>
    )
  }

  if (!contract) return null

  const isEnabled = contract.enabled ?? true

  return (
    <div className="space-y-8 max-w-4xl">
      {walletNetworkMismatch && (
        <div
          data-testid="network-mismatch-banner"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-300 flex items-center gap-2"
        >
          <svg className="w-5 h-5 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{walletNetworkMismatch}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-100">{contract.label}</h1>
            <NetworkBadge network={contract.network} />
          </div>
          <div className="flex items-center gap-2">
            <a
              href={explorerContractUrl(contract.network, contract.contract_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-indigo-400 hover:text-indigo-300 transition-colors break-all"
            >
              {truncateId(contract.contract_id, 12)}
            </a>
            <CopyButton text={contract.contract_id} />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {/* Pause/Resume Switch */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900">
            <span className="text-sm text-zinc-300 min-w-[3rem]">{isEnabled ? 'Active' : 'Paused'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              onClick={toggleContractPause}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                isEnabled ? 'bg-indigo-500' : 'bg-zinc-600'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  isEnabled ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <button
            onClick={openEditMetadata}
            className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            Edit Metadata
          </button>
          <button
            onClick={openEditRules}
            className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            Edit Rules
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="px-3 py-1.5 rounded-lg border border-red-900/50 hover:border-red-700 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Edit Details modal */}
      {showEditMetadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-100">Edit Details</h2>

            <div className="space-y-1">
              <label className="text-sm text-zinc-400">Label</label>
              <input
                value={editedLabel}
                onChange={(e) => {
                  const val = e.target.value
                  setEditedLabel(val)
                  const trimmed = val.trim().toLowerCase()
                  if (trimmed && getContracts().some((c) => c.id !== contract?.id && c.label.trim().toLowerCase() === trimmed)) {
                    setEditedLabelWarning('A contract with this label already exists')
                  } else {
                    setEditedLabelWarning(null)
                  }
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
              {editedLabelWarning && <p className="text-xs text-amber-400">{editedLabelWarning}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm text-zinc-400">Webhook URL</label>
              <input
                value={editedWebhookUrl}
                onChange={(e) => setEditedWebhookUrl(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <NetworkEditField
              currentNetwork={editedNetwork}
              onNetworkChange={setEditedNetwork}
              value={editedNetwork}
              onChange={setEditedNetwork}
            />
          </div>
          <NetworkEditField
            currentNetwork={editedNetwork}
            onNetworkChange={setEditedNetwork}
            checkDuplicate={(network) => {
              const existing = getContract(contract!.contract_id)
              return !!existing && existing.network === network
            }}
            onAlertHistoryCleared={() => setAlerts([])}
          />
          {metadataError && (
            <p className="text-sm text-red-400">{metadataError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCancelMetadataEdit}
              className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveMetadata}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
            >
              Save
            </button>

            {metadataError && (
              <p className="text-sm text-red-400">{metadataError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleCancelMetadataEdit}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveMetadata}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Rules Modal */}
      {showEditRules && (
        <Modal
          open={showEditRules}
          onClose={handleCancelEdit}
          title="Edit Rules"
        >
          <div className="space-y-4">
            <RuleBuilder rules={editedRules} onChange={setEditedRules} />
            {rulesError && (
              <p className="text-sm text-red-400">{rulesError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveRules}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete Contract"
        destructive
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Are you sure you want to delete <span className="font-medium text-zinc-200">{contract.label}</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowDelete(false)}
              className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-medium text-white transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
        </Modal>
      )}

      {/* Registered card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Registered</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Registered</dt>
            <dd className="text-zinc-200">{formatDate(contract.created_at)}</dd>
          </div>
          {contract.updated_at && contract.updated_at !== contract.created_at && (
            <div>
              <dt className="text-zinc-500">Last modified</dt>
              <dd className="text-zinc-200">{formatDate(contract.updated_at)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Rules */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">Alert Rules</h2>
          <span className="text-xs text-zinc-500">{contract.rules.length} rule{contract.rules.length === 1 ? '' : 's'}</span>
        </div>
        {contract.rules.length === 0 ? (
          <p className="text-sm text-zinc-500">No rules configured.</p>
        ) : (
          <ul className="space-y-2">
            {contract.rules.map((rule, i) => (
              <li
              <div
                key={i}
                data-testid="active-rule"
                className={`flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 ${isRuleEnabled(rule) ? '' : 'opacity-50'}`}
              >
                <div className="flex items-center gap-2">
                  <AlertRuleBadge type={rule.type} />
                  {formatRuleSummary(rule) && (
                    <span className="text-xs font-mono text-zinc-400">{formatRuleSummary(rule)}</span>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isRuleEnabled(rule)}
                  aria-label={isRuleEnabled(rule) ? 'Disable rule' : 'Enable rule'}
                  onClick={() => toggleRule(i)}
                  className="text-xs text-zinc-400 hover:text-zinc-100"
                >
                  {isRuleEnabled(rule) ? 'On' : 'Off'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Webhook */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Webhook</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-zinc-400 break-all">{maskWebhookUrl(contract.webhook_url)}</span>
          <CopyButton text={contract.webhook_url} />
        </div>
        <NotificationToggle />
      </div>

      {/* Webhook log */}
      <WebhookLog alerts={alerts} network={contract.network} />
      </div>

      {/* Alerts */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Alerts</h2>
            {sync.enabled && (
              <div className="flex items-center gap-2 text-xs bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-zinc-800">
                {sync.live ? (
                  <span className="text-emerald-400 flex items-center gap-1.5" data-testid="sync-status-live">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Live · synced {sync.lastSync ? formatRelativeTime(sync.lastSync, now) : 'just now'}
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1" data-testid="sync-status-error">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Sync failing
                  </span>
                )}
                <div className="w-px h-3 bg-zinc-700 mx-1"></div>
                <button 
                  onClick={sync.syncNow} 
                  className="text-zinc-400 hover:text-zinc-200 transition-colors font-medium" 
                  data-testid="sync-now-button"
                >
                  Sync now
                </button>
              </div>
            )}
          </div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Alerts</h2>
          <NotificationToggle contractId={contract.contract_id} />
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-zinc-500">No alerts yet.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-center justify-between gap-2">
                  <AlertRuleBadge rule={a.rule} />
                  <span className="text-xs text-zinc-500">{formatDate(a.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-300">{formatRuleSummary(a.rule)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Webhook Log */}
      <WebhookLog contractId={contract.contract_id} />
      
      {/* Modals continued */}
      {showUnsavedWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-base font-semibold text-zinc-100">Discard unsaved changes?</h3>
            <p className="text-sm text-zinc-400">Your rule edits will be lost.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowUnsavedWarning(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={confirmDiscard}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-medium text-white transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-base font-semibold text-zinc-100">Delete contract?</h3>
            <p className="text-sm text-zinc-400">This will remove the contract and its alert history.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDelete(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-medium text-white transition-colors"
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
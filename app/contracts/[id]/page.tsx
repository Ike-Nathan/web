'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WatchedContract, AlertPayload, AlertRule, isRuleEnabled } from '@/types'
import { syncSaveContract, syncDeleteContract } from '@/lib/contractSync'
import { getContract, deleteContract, getAlerts, saveContract, seedMockAlerts } from '@/lib/storage'
import { truncateId, explorerContractUrl, mapFreighterNetwork, validateWebhookUrl, generateWebhookSecret } from '@/lib/stellar'
import { getContract, deleteContract, getAlerts, saveContract, seedMockAlerts, getContracts } from '@/lib/storage'
import { formatDate, formatRuleSummary } from '@/lib/format'
import { useAnalytics } from '@/lib/useAnalytics'
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
  const [editedWebhookSecret, setEditedWebhookSecret] = useState('')
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [metadataWarning, setMetadataWarning] = useState<string | null>(null)
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
    void syncDeleteContract(params.id)
    router.push('/contracts')
  }

  function openEditRules() {
    setEditedRules(contract!.rules)
    setRulesError(null)
    setShowEditRules(true)
    trackEvent('rule_edit_opened', { contractId: params.id, ruleCount: contract!.rules.length })
  }

  function saveRules() {
    if (editedRules.length === 0) { setRulesError('Add at least one rule'); return }
    const updated = { ...contract!, rules: editedRules }
    void syncSaveContract(updated, false)
    if (!saveContract(updated)) {
      setRulesError('Could not save: browser storage is full or unavailable')
      return
    }
    setContract(updated)
    setShowEditRules(false)
    trackEvent('rule_edit_saved', { contractId: params.id, ruleCount: editedRules.length })
  }

  function toggleRule(index: number) {
    const rules = contract!.rules.map((r, i) => (i === index ? { ...r, enabled: !isRuleEnabled(r) } : r))
    const updated = { ...contract!, rules }
    void syncSaveContract(updated, false)
    if (!saveContract(updated)) return
    setContract(updated)
  }

  function hasUnsavedChanges(): boolean {
    return JSON.stringify(editedRules) !== JSON.stringify(contract?.rules ?? [])
  }

  function handleCancelEdit() {
    if (hasUnsavedChanges()) {
      setShowUnsavedWarning(true)
    } else {
      setShowEditRules(false)
    }
  }

  function confirmDiscard() {
    setShowUnsavedWarning(false)
    setShowEditRules(false)
  }

  // Metadata editing functions
  function openEditMetadata() {
    setEditedLabel(contract!.label)
    setEditedWebhookUrl(contract!.webhook_url)
    setEditedNetwork(contract!.network)
    setEditedWebhookSecret(contract!.webhook_secret ?? '')
    setMetadataError(null)
    setMetadataWarning(null)
    setEditedLabelWarning(null)
    setShowEditMetadata(true)
    trackEvent('metadata_edit_opened', { contractId: params.id })
  }

  function saveMetadata() {
    // Validation
    const trimmedLabel = editedLabel.trim()
    const trimmedWebhookUrl = editedWebhookUrl.trim()

    if (!trimmedLabel) {
      setMetadataError('Label is required')
      return
    }

    if (trimmedLabel.length > 100) {
      setMetadataError('Label must be 100 characters or less')
      return
    }

    if (!trimmedWebhookUrl) {
      setMetadataError('Webhook URL is required')
      return
    }

    const urlResult = validateWebhookUrl(trimmedWebhookUrl, editedNetwork)
    if (urlResult.code === 'http_warning') {
      setMetadataWarning(urlResult.message)
      setMetadataError(null)
    } else if (!urlResult.valid) {
      setMetadataWarning(null)
      setMetadataError(urlResult.message)
      return
    } else {
      setMetadataWarning(null)
      setMetadataError(null)
    }

    const networkChanged = editedNetwork !== contract!.network

    // Duplicate contract_id + network check before saving a network switch
    if (networkChanged) {
      const existing = getContract(contract!.contract_id)
      if (existing && existing.network === editedNetwork) {
        setMetadataError('A contract with this ID already exists on the selected network')
        return
      }
    }

    // Save changes
    const updated = { 
      ...contract!, 
      label: trimmedLabel,
      webhook_url: trimmedWebhookUrl,
      network: editedNetwork,
      webhook_secret: editedWebhookSecret.trim() || undefined,
    }
    void syncSaveContract(updated, false)
    if (!saveContract(updated)) {
      setMetadataError('Could not save: browser storage is full or unavailable')
      return
    }

    // Alert history is cleared on network switch, matching the warning copy
    if (networkChanged) {
      setAlerts([])
      trackEvent('network_switched', { contractId: params.id, network: editedNetwork })
    }

    setContract(updated)
    setShowEditMetadata(false)
    trackEvent('metadata_edit_saved', { contractId: params.id })
  }

  function hasMetadataChanges(): boolean {
    return (
      editedLabel !== contract?.label ||
      editedWebhookUrl !== contract?.webhook_url ||
      editedNetwork !== contract?.network ||
      editedWebhookSecret !== (contract?.webhook_secret ?? '')
    )
  }

  function generateSecret() {
    setEditedWebhookSecret(generateWebhookSecret())
  }

  function rotateSecret() {
    setEditedWebhookSecret(generateWebhookSecret())
  }

  async function copySecret() {
    if (!editedWebhookSecret) return
    try {
      await navigator.clipboard.writeText(editedWebhookSecret)
    } catch {
      // Clipboard unavailable; ignore
    }
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
            className="px-3 py-1.5 rounded-lg border border-red-900/60 hover:border-red-700 text-sm text-red-400 hover:text-red-300 transition-colors"
            className="px-3 py-1.5 rounded-lg border border-red-900/50 hover:border-red-700 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Edit Details Modal */}
      <Modal
        open={showEditMetadata}
        onClose={handleCancelMetadataEdit}
        title="Edit Details"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="edit-label" className="block text-sm font-medium text-zinc-300">
              Label
            </label>
            <input
              id="edit-label"
              type="text"
              value={editedLabel}
              onChange={(e) => setEditedLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-950 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-webhook" className="block text-sm font-medium text-zinc-300">
              Webhook URL
            </label>
            <input
              id="edit-webhook"
              type="text"
              value={editedWebhookUrl}
              onChange={(e) => setEditedWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-950 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-webhook-secret" className="block text-sm font-medium text-zinc-300">
              Webhook Signing Secret
            </label>
            <div className="flex items-center gap-2">
              <input
                id="edit-webhook-secret"
                type="password"
                autoComplete="off"
                value={editedWebhookSecret}
                onChange={(e) => setEditedWebhookSecret(e.target.value)}
                placeholder="No secret set"
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-950 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={generateSecret}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Generate
              </button>
              <button
                type="button"
                onClick={copySecret}
                disabled={!editedWebhookSecret}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={rotateSecret}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Rotate
              </button>
            </div>
          </div>
          {metadataWarning && (
            <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-300">
              <span>{metadataWarning}</span>
              <button
                type="button"
                onClick={() => setMetadataWarning(null)}
                aria-label="Dismiss warning"
                className="text-amber-400 hover:text-amber-200"
              >
                ×
              </button>
            </div>
          )}
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
          </div>
        </div>
      </Modal>

      {/* Edit Rules Modal */}
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
      </Modal>

      {/* Discard Changes Modal */}
      <Modal
        open={showUnsavedWarning}
        onClose={() => setShowUnsavedWarning(false)}
        title="Discard Changes?"
        destructive
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            You have unsaved changes. Are you sure you want to discard them?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowUnsavedWarning(false)}
              className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              Keep Editing
            </button>
            <button
              onClick={confirmDiscard}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-medium text-white transition-colors"
            >
              Discard
            </button>
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
              <li key={i} className="flex items-center gap-2">
                <AlertRuleBadge rule={rule} />
                <span className="text-sm text-zinc-400">{formatRuleSummary(rule)}</span>
              </li>
              <div
                key={i}
                data-testid="active-rule"
                className={`flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 ${isRuleEnabled(rule) ? '' : 'opacity-50'}`}
              >
                <AlertRuleBadge type={rule.type} />
                {formatRuleSummary(rule) && (
                  <span className="text-xs font-mono text-zinc-400">{formatRuleSummary(rule)}</span>
                )}
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
              </div>
            ))}
          </ul>
        )}
      </div>

      {/* Webhook */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Webhook</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-zinc-400 break-all">{contract.webhook_url}</span>
          <CopyButton text={contract.webhook_url} />
        </div>
        <NotificationToggle contractId={contract.contract_id} />
      </div>

      {/* Webhook log */}
      <WebhookLog contractId={contract.contract_id} webhookSecret={contract.webhook_secret} />

      {/* Modals */}
      {showEditRules && (
        <RuleBuilder
          rules={editedRules}
          onChange={setEditedRules}
          onSave={saveRules}
          onCancel={handleCancelEdit}
          error={rulesError}
        />
      )}

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

      {showEditMetadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-base font-semibold text-zinc-100">Edit Metadata</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-zinc-400">Label</label>
                <input
                  value={editedLabel}
                  onChange={(e) => setEditedLabel(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-zinc-400">Webhook URL</label>
                <input
                  value={editedWebhookUrl}
                  onChange={(e) => setEditedWebhookUrl(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              {metadataError && <p className="text-sm text-red-400">{metadataError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button
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

            <div className="space-y-1">
              <label className="text-sm text-zinc-400">Webhook Signing Secret</label>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  value={editedWebhookSecret}
                  onChange={(e) => setEditedWebhookSecret(e.target.value)}
                  placeholder="No secret set"
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
                <button
                  type="button"
                  onClick={generateSecret}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
                >
                  Generate
                </button>
                <button
                  type="button"
                  onClick={copySecret}
                  disabled={!editedWebhookSecret}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={rotateSecret}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
                >
                  Rotate
                </button>
              </div>
            </div>

            <NetworkEditField
              value={editedNetwork}
              onChange={setEditedNetwork}
            />

            {metadataWarning && (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-300">
                <span>{metadataWarning}</span>
                <button
                  type="button"
                  onClick={() => setMetadataWarning(null)}
                  aria-label="Dismiss warning"
                  className="text-amber-400 hover:text-amber-200"
                >
                  ×
                </button>
              </div>
            )}

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
      </Modal>

      {/* Alerts */}
      <div className="space-y-4">
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
      <WebhookLog contractId={contract.contract_id} webhookSecret={contract.webhook_secret} />
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
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

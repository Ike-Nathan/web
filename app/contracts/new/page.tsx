'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AlertPayload, AlertRule, Network, WatchedContract } from '@/types'
import { isValidContractId, isValidUrl, normalizeContractId } from '@/lib/stellar'
import { syncSaveContract } from '@/lib/contractSync'
import { addContract, getContracts, saveContract } from '@/lib/storage'
import { buildTestWebhookPayload, describeRule, sendTestWebhook } from '@/lib/api'
import { generateWebhookSecret } from '@/lib/webhookSignature'
import { generateId } from '@/lib/id'
import { parseAlertRule } from '@/lib/alertRules'
import CopyButton from '@/components/CopyButton'
import ContractVerification from '@/components/ContractVerification'
import { useFreighterConnection } from '@/lib/useFreighterConnection'
import { useNetworkMismatchWarning } from '@/lib/useNetworkMismatchWarning'
import RuleBuilder from '@/components/RuleBuilder'
import FreighterConnect from '@/components/FreighterConnect'
import { useToast } from '@/components/ToastProvider'

interface FormErrors {
  label?: string
  contract_id?: string
  webhook_url?: string
  rules?: string
  wallet?: string
  network?: string
}

export default function NewContractPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const { isConnected } = useFreighterConnection()
  const [networkWarning, setNetworkWarning] = useState<string | null>(null)
  const [hasNetworkMismatch, setHasNetworkMismatch] = useState(false)
  const [mismatchAcknowledged, setMismatchAcknowledged] = useState(false)
  const [label, setLabel] = useState('')
  const [labelWarning, setLabelWarning] = useState<string | null>(null)
  const [contractId, setContractId] = useState('')
  const [network, setNetwork] = useState<Network>('testnet')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [rules, setRules] = useState<AlertRule[]>([])
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number>(0)
  const [showPayloadPreview, setShowPayloadPreview] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<
    'idle' | 'checking' | 'found' | 'not_found' | 'error'
  >('idle')
  const [verificationReason, setVerificationReason] = useState<string | null>(null)
  const [verificationOverridden, setVerificationOverridden] = useState(false)
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null)
  const [showDiscardModal, setShowDiscardModal] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const isDirty = Boolean(
    label.trim() || contractId.trim() || webhookUrl.trim() || webhookSecret.trim() || rules.length > 0
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !saving) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, saving])

  function navigateBack() {
    if (
      typeof window !== 'undefined' &&
      window.history.length > 1 &&
      document.referrer &&
      document.referrer.includes(window.location.host)
    ) {
      router.back()
    } else {
      router.push('/contracts')
    }
  }

  function handleCancel() {
    if (isDirty) {
      setShowDiscardModal(true)
    } else {
      navigateBack()
    }
  }
  const [testRuleIndex, setTestRuleIndex] = useState(0)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const testAbortRef = useRef<AbortController | null>(null)

  // The rule being simulated; falls back to the first rule if it was removed.
  const testRule: AlertRule | undefined =
    rules[testRuleIndex] ?? (rules.length > 0 ? rules[0] : undefined)

  // Preview of the exact JSON that will be posted, so the receiver's
  // rule-specific branching can be checked before delivering it.
  const testPayload = useMemo<AlertPayload>(
    () =>
      buildTestWebhookPayload({
        contractId: contractId.trim(),
        network,
        rule: testRule,
      }),
    [contractId, network, testRule]
  )

  // Abort an in-flight test delivery if the form unmounts mid-request.
  useEffect(() => () => testAbortRef.current?.abort(), [])

  // Warns on mount, on network change, and after connecting, not only when the
  // network <select> changes.
  const { networkWarning, checkNetworkMismatch, clearNetworkWarning } =
    useNetworkMismatchWarning(network, isConnected)

  const labelInputRef = useRef<HTMLInputElement>(null)
  const contractIdInputRef = useRef<HTMLInputElement>(null)
  const webhookUrlInputRef = useRef<HTMLInputElement>(null)
  const rulesRef = useRef<HTMLDivElement>(null)

  // Pre-fill from a "Duplicate Contract" action. Data is passed via
  // sessionStorage (never the URL) so the webhook URL is not leaked.
  useEffect(() => {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem('txwatch_duplicate_contract')
      if (raw) sessionStorage.removeItem('txwatch_duplicate_contract')
    } catch {
      return
    }
    if (!raw) return
    try {
      const data = JSON.parse(raw) as {
        label?: string
        webhook_url?: string
        rules?: AlertRule[]
      }
      if (typeof data.label === 'string') setLabel(data.label)
      if (typeof data.webhook_url === 'string') setWebhookUrl(data.webhook_url)
      if (Array.isArray(data.rules)) {
        const validRules: AlertRule[] = []
        let dropped = 0
        for (const raw of data.rules) {
          const parsed = parseAlertRule(raw)
          if (parsed) {
            validRules.push(parsed)
          } else {
            dropped += 1
          }
        }
        setRules(validRules)
        if (dropped > 0) {
          setPrefillNotice(
            `Skipped ${dropped} invalid rule${dropped === 1 ? '' : 's'} from the duplicated contract.`
          )
        }
      }
    } catch {
      // ignore malformed pre-fill data
    }
  }, [])

  const checkNetworkMismatch = useCallback(async (selectedNetwork: Network) => {
    if (!window.freighter) {
      setNetworkWarning(null)
      setHasNetworkMismatch(false)
      return
    }
    try {
      const connected = await window.freighter.isConnected()
      if (!connected) {
        setNetworkWarning(null)
        setHasNetworkMismatch(false)
        return
      }
      const walletNetwork = await window.freighter.getNetwork()
      const networkMap: Record<string, string> = {
        testnet: 'TESTNET',
        mainnet: 'PUBLIC',
        futurenet: 'FUTURENET',
      }
      const expectedNetwork = networkMap[selectedNetwork]
      if (walletNetwork && walletNetwork !== expectedNetwork) {
        setNetworkWarning(
          `Your wallet is on ${walletNetwork}, but this contract is on ${selectedNetwork.toUpperCase()}`
        )
        setHasNetworkMismatch(true)
      } else {
        setNetworkWarning(null)
        setHasNetworkMismatch(false)
      }
    } catch {
      setNetworkWarning(null)
      setHasNetworkMismatch(false)
    }
  }, [])

  useEffect(() => {
    if (isConnected) {
      checkNetworkMismatch(network)
    } else {
      setNetworkWarning(null)
      setHasNetworkMismatch(false)
      setMismatchAcknowledged(false)
    }
  }, [network, isConnected, checkNetworkMismatch])

  function handleWalletConnect() {
    setErrors((prev) => ({ ...prev, wallet: undefined }))
    checkNetworkMismatch(network)
    // The wallet's network is only knowable once it is connected.
    void checkNetworkMismatch()
  }

  function handleWalletDisconnect() {
    clearNetworkWarning()
  }

  function validate(): FormErrors {
    const e: FormErrors = {}
    const trimmedLabel = label.trim()
    const trimmedContractId = contractId.trim()
    const trimmedWebhookUrl = webhookUrl.trim()

    if (!trimmedLabel) {
      e.label = 'Label is required'
    } else if (trimmedLabel.length > 100) {
      e.label = 'Label must be 100 characters or less'
    }

    if (!trimmedContractId) {
      e.contract_id = 'Contract ID is required'
    } else if (!isValidContractId(trimmedContractId)) {
      e.contract_id = 'Must be a valid Soroban contract address (starts with C, 56 chars)'
    } else {
      // Check for duplicate contract_id + network combination
      const isDuplicate = getContracts().some(
        (c) => c.contract_id === trimmedContractId && c.network === network
      )
      if (isDuplicate) {
        e.contract_id = `This contract is already registered on ${network}`
      }
    }

    if (!trimmedWebhookUrl) {
      e.webhook_url = 'Webhook URL is required'
    } else if (!isValidUrl(trimmedWebhookUrl)) {
      e.webhook_url = 'Must be a valid http/https URL'
    }

    if (rules.length === 0) {
      e.rules = 'Add at least one alert rule'
    }

    if (!trimmedWebhookUrl) e.webhook_url = 'Webhook URL is required'
    else if (!isValidUrl(trimmedWebhookUrl)) e.webhook_url = 'Must be a valid http/https URL'
    if (rules.length === 0) e.rules = 'Add at least one alert rule'
    if (hasNetworkMismatch && !mismatchAcknowledged) {
      e.network = 'Please acknowledge that your wallet is on a different network before saving'
    }
    return e
  }

  function isFormValid(): boolean {
    return Object.keys(validate()).length === 0
  }

  function handleContractIdBlur() {
    const norm = normalizeContractId(contractId)
    let updatedId = contractId.trim()
    let targetNetwork = network
    if (norm.contractId && norm.contractId !== contractId) {
      updatedId = norm.contractId
      setContractId(updatedId)
    }
    if (norm.network && norm.network !== network) {
      targetNetwork = norm.network
      setNetwork(targetNetwork)
      checkNetworkMismatch(targetNetwork)
    }
  }

  function handleContractIdPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    if (!pasted) return
    const norm = normalizeContractId(pasted)
    if (norm.contractId) {
      e.preventDefault()
      setContractId(norm.contractId)
      setErrors((prev) => ({ ...prev, contract_id: undefined }))
      let targetNetwork = network
      if (norm.network && norm.network !== network) {
        targetNetwork = norm.network
        setNetwork(targetNetwork)
        checkNetworkMismatch(targetNetwork)
      }
    }
  }

  async function checkNetworkMismatch(selectedNetwork: Network) {
    const walletNetwork = await getWalletNetwork()
    if (!walletNetwork) {
      setNetworkWarning(null)
      return
    }
    if (isNetworkMatch(selectedNetwork, walletNetwork)) {
      setNetworkWarning(null)
    } else {
      setNetworkWarning(
        `Your wallet is on ${walletNetwork}, but this contract is on ${selectedNetwork.toUpperCase()}`
      )
    }
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length > 0) {
      setErrors(e)
      if (e.label) {
        labelInputRef.current?.focus()
      } else if (e.contract_id) {
        contractIdInputRef.current?.focus()
      } else if (e.webhook_url) {
        webhookUrlInputRef.current?.focus()
      } else if (e.rules) {
        rulesRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
      return
    }

    if (!isConnected) {
      setErrors({ wallet: 'Connect your Freighter wallet to save contracts' })
      return
    }

    // Block saving only on an authoritative not_found result without an override.
    if (verificationStatus === 'not_found' && !verificationOverridden) {
      return
    }

    setSaving(true)
    const contract: WatchedContract = {
      id: generateId(),
      label: label.trim(),
      contract_id: contractId.trim(),
      network,
      rules,
      webhook_url: webhookUrl.trim(),
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    await syncSaveContract(contract, true)
    addContract(contract)
    if (!saveContract(contract)) {
      setSaving(false)
      showToast('Could not save contract: browser storage is full or unavailable.', 'error')
      return
    }
    try {
      sessionStorage.setItem('txwatch_last_created_contract', contract.id)
    } catch {
      // ignore storage errors
    }
    showToast(`Contract "${contract.label}" saved successfully!`, 'success')
    saveTimeoutRef.current = setTimeout(() => {
      router.push(`/contracts/${contract.id}`)
    }, 1500)
  }

  async function handleTestWebhook() {
    if (!webhookUrl.trim()) {
      setErrors((prev) => ({ ...prev, webhook_url: 'Webhook URL is required to test' }))
      return
    }
    setTestStatus('sending')
    setTestError(null)
    try {
      const selectedRule = rules[selectedRuleIndex]
      const res = await sendTestWebhook(
        webhookUrl.trim(),
        contractId.trim() || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network,
        10000,
        webhookSecret || undefined,
        { rule: selectedRule }
      )
    const url = webhookUrl.trim()
    if (!url) {
      setTestStatus('error')
      setTestError('Enter a webhook URL first.')
      return
    }
    if (!isValidUrl(url)) {
      setTestStatus('error')
      setTestError('Must be a valid http/https URL')
      return
    }

    testAbortRef.current?.abort()
    const controller = new AbortController()
    testAbortRef.current = controller

    setTestStatus('sending')
    setTestError(null)

    // Send the exact payload shown in the preview, with a fresh timestamp.
    const payload = buildTestWebhookPayload({
      contractId: contractId.trim(),
      network,
      rule: testRule,
    })

    try {
      const res = await sendTestWebhook(url, {
        payload,
        signalOrTimeoutMs: controller.signal,
        secret: webhookSecret || undefined,
      })
      if (res.ok) {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        setTestError(`Delivery failed with HTTP status ${res.status}`)
      }
    } catch (err: any) {
      setTestStatus('error')
      setTestError(err?.message || 'Failed to send test webhook')
        setTestError(`Receiver responded with HTTP ${res.status}.`)
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      setTestStatus('error')
      setTestError(err instanceof Error ? err.message : 'Failed to send test webhook.')
    }
  }

  return (
    <>
      {showDiscardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-base font-semibold text-zinc-100">Discard unsaved changes?</h3>
            <p className="text-sm text-zinc-400">Your contract configuration will be lost.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDiscardModal(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardModal(false)
                  navigateBack()
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-medium text-white transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Add Contract</h1>
          <p className="text-sm text-zinc-500 mt-1">Register a Soroban contract to monitor</p>
        </div>

        <form onSubmit={handleSave} noValidate className="space-y-5">
          {prefillNotice && (
            <div
              className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300"
              data-testid="prefill-notice"
            >
              {prefillNotice}
            </div>
          )}
          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Label</label>
            <input
              ref={labelInputRef}
              type="text"
              placeholder="e.g. My DEX Contract"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setErrors((prev) => ({ ...prev, label: undefined })) }}
              maxLength={100}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <div className="flex justify-between items-start mt-1">
              <div>
                {errors.label && <p className="text-xs text-red-400">{errors.label}</p>}
              </div>
              <p className="text-xs text-zinc-500">{label.length}/100</p>
            </div>
          </div>

          {/* Contract ID */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Contract ID</label>
            <input
              ref={contractIdInputRef}
              type="text"
              autoComplete="off"
              placeholder="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
              value={contractId}
              onChange={(e) => {
                setContractId(e.target.value)
                setErrors((prev) => ({ ...prev, contract_id: undefined }))
              }}
              onBlur={handleContractIdBlur}
              onPaste={handleContractIdPaste}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            />
            {errors.contract_id && <p className="text-xs text-red-400 mt-1">{errors.contract_id}</p>}
            <ContractVerification
              network={network}
              contractId={contractId}
              className="mt-1"
              onStatusChange={(status, reason) => {
                setVerificationStatus(status)
                setVerificationReason(reason ?? null)
              }}
              overridden={verificationOverridden}
              onOverrideChange={setVerificationOverridden}
            />
            {verificationStatus === 'not_found' && !verificationOverridden && (
              <p className="text-xs text-amber-400 mt-1" data-testid="verification-blocking">
                {verificationReason || `Contract not found on ${network}`}. Tick the override above to save anyway.
              </p>
            )}
          </div>
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Add Contract</h1>
        <p className="text-sm text-zinc-500 mt-1">Register a Soroban contract to monitor</p>
      </div>

      <div className="space-y-5">
        {/* Label */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Label</label>
          <input
            type="text"
            placeholder="e.g. My DEX Contract"
            value={label}
            onChange={(e) => {
              const val = e.target.value
              setLabel(val)
              setErrors((prev) => ({ ...prev, label: undefined }))
              const trimmed = val.trim().toLowerCase()
              if (trimmed && getContracts().some((c) => c.label.trim().toLowerCase() === trimmed)) {
                setLabelWarning('A contract with this label already exists')
              } else {
                setLabelWarning(null)
              }
            }}
            maxLength={100}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <div className="flex justify-between items-start mt-1">
            <div>
              {errors.label && <p className="text-xs text-red-400">{errors.label}</p>}
              {labelWarning && !errors.label && <p className="text-xs text-amber-400">{labelWarning}</p>}
            </div>
            <p className="text-xs text-zinc-500">{label.length}/100</p>
          </div>
        </div>

        {/* Contract ID */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Contract ID</label>
          <input
            type="text"
            placeholder="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
            value={contractId}
            onChange={(e) => { setContractId(e.target.value); setErrors((prev) => ({ ...prev, contract_id: undefined })) }}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
          />
          {errors.contract_id && <p className="text-xs text-red-400 mt-1">{errors.contract_id}</p>}
          <ContractVerification network={network} contractId={contractId} className="mt-1" />
        </div>

        {/* Network */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Network</label>
          <select
            value={network}
            onChange={(e) => {
              const n = e.target.value as Network
              setNetwork(n)
              setErrors((prev) => ({ ...prev, network: undefined }))
              checkNetworkMismatch(n)
            }}
            onChange={(e) => setNetwork(e.target.value as Network)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="testnet">Testnet</option>
            <option value="mainnet">Mainnet</option>
            <option value="futurenet">Futurenet</option>
          </select>
          {networkWarning && <p className="text-xs text-amber-400 mt-1">{networkWarning}</p>}
          {hasNetworkMismatch && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="acknowledge-mismatch"
                checked={mismatchAcknowledged}
                onChange={(e) => {
                  setMismatchAcknowledged(e.target.checked)
                  if (e.target.checked) {
                    setErrors((prev) => ({ ...prev, network: undefined }))
                  }
                }}
                className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="acknowledge-mismatch" className="text-xs text-zinc-300">
                I understand this contract is on a different network than my connected wallet
              </label>
            </div>
          )}
          {errors.network && <p className="text-xs text-red-400 mt-1">{errors.network}</p>}
        </div>

        {/* Webhook URL */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Webhook URL</label>
          <input
            type="text"
            type="url"
            placeholder="https://example.com/webhook"
            value={webhookUrl}
            onChange={(e) => { setWebhookUrl(e.target.value); setErrors((prev) => ({ ...prev, webhook_url: undefined })) }}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {errors.webhook_url && <p className="text-xs text-red-400 mt-1">{errors.webhook_url}</p>}
        </div>

          {/* Network */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Network</label>
            <select
              value={network}
              onChange={(e) => {
                const n = e.target.value as Network
                setNetwork(n)
                checkNetworkMismatch(n)
              }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
              <option value="futurenet">Futurenet</option>
            </select>
            {networkWarning && <p className="text-xs text-amber-400 mt-1">{networkWarning}</p>}
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Webhook URL</label>
            <input
              ref={webhookUrlInputRef}
              type="text"
              inputMode="url"
              placeholder="https://example.com/webhook"
              value={webhookUrl}
              onChange={(e) => { setWebhookUrl(e.target.value); setErrors((prev) => ({ ...prev, webhook_url: undefined })) }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {errors.webhook_url && <p className="text-xs text-red-400 mt-1">{errors.webhook_url}</p>}
        {/* Test Payload Rule Selection and Preview (#24) */}
        {webhookUrl && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Simulate Rule in Test Payload</span>
              <button
                type="button"
                onClick={() => setShowPayloadPreview(!showPayloadPreview)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {showPayloadPreview ? 'Hide Preview' : 'Preview JSON'}
              </button>
            </div>
            {rules.length > 0 ? (
              <select
                value={selectedRuleIndex}
                onChange={(e) => setSelectedRuleIndex(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200"
              >
                {rules.map((r, idx) => (
                  <option key={r.id || idx} value={idx}>
                    Rule #{idx + 1}: {r.rule_type} {r.function_name ? `(${r.function_name})` : ''} {r.min_amount ? `(min: ${r.min_amount})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-zinc-500">Defaulting to AnyTransaction test payload</p>
            )}
            {showPayloadPreview && (
              <pre className="mt-2 p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 overflow-x-auto">
                {JSON.stringify(
                  buildTestWebhookPayload(
                    contractId.trim() || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                    network,
                    { rule: rules[selectedRuleIndex] }
                  ),
                  null,
                  2
                )}
              </pre>
            )}
          </div>
        )}

        {/* Wallet */}
        {!isConnected && (
          <div>
            <FreighterConnect onConnect={handleWalletConnect} onDisconnect={handleWalletDisconnect} />
            {errors.wallet && <p className="text-xs text-red-400 mt-1">{errors.wallet}</p>}
          </div>

          {/* Rules */}
          <div ref={rulesRef}>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Alert Rules</label>
            <RuleBuilder rules={rules} onChange={setRules} />
            {errors.rules && <p className="text-xs text-red-400 mt-1">{errors.rules}</p>}
          </div>

          {/* Wallet */}
          {!isConnected && (
            <div>
              <FreighterConnect onConnect={handleWalletConnect} />
              {errors.wallet && <p className="text-xs text-red-400 mt-1">{errors.wallet}</p>}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Contract'}
            </button>
            <WebhookTestButton
              webhookUrl={webhookUrl}
              contractId={contractId}
              network={network}
              webhookSecret={webhookSecret}
              onError={(field, message) => setErrors((prev) => ({ ...prev, [field]: message }))}
              className="mt-0"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !isFormValid()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Contract'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTestWebhook}
            disabled={testStatus === 'sending'}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            {testStatus === 'sending' ? 'Testing…' : 'Test Webhook'}
          </button>
        </div>
        </form>
        {testStatus === 'ok' && <p className="text-xs text-emerald-400">Webhook delivered successfully.</p>}
        {testStatus === 'error' && <p className="text-xs text-red-400">{testError}</p>}

        {/* Simulated delivery */}
        <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
          <div>
            <label htmlFor="test-rule" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Simulate rule
            </label>
            <select
              id="test-rule"
              value={Math.min(testRuleIndex, Math.max(rules.length - 1, 0))}
              onChange={(e) => {
                setTestRuleIndex(Number(e.target.value))
                setTestStatus('idle')
                setTestError(null)
              }}
              disabled={rules.length === 0}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
            >
              {rules.length === 0 && <option value={0}>No rules configured yet</option>}
              {rules.map((rule, index) => (
                <option key={index} value={index}>
                  {describeRule(rule)}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              Sends a realistic payload for the selected rule, marked with{' '}
              <code className="text-zinc-400">is_test: true</code>.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="block text-sm font-medium text-zinc-300">Payload preview</span>
              <CopyButton text={JSON.stringify(testPayload, null, 2)} />
            </div>
            <pre className="w-full max-h-64 overflow-auto bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(testPayload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
      </div>
      </div>
    </>
  )
}

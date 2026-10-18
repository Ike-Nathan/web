'use client'

import { useEffect, useRef, useState } from 'react'
import { getContracts, exportAllStorageData, rekeyAlerts } from '@/lib/storage'
import { syncSaveContract, syncDeleteContract } from '@/lib/sync'
import {
  buildBackup,
  buildSnapshot,
  parseImport,
  planImport,
  type DuplicateStrategy,
  type ImportMode,
  type ImportParseResult,
} from '@/lib/importSchema'

const MAX_FILE_BYTES = 5 * 1024 * 1024

type ExportMode = 'contracts' | 'everything'

function contractKey(c: { contract_id: string; network: string }) {
  return `${c.contract_id}::${c.network}`
}

export default function ContractImportExport() {
  const [parsed, setParsed] = useState<ImportParseResult | null>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [dupes, setDupes] = useState<DuplicateStrategy>('skip')
  const [exportMode, setExportMode] = useState<ExportMode>('contracts')
  const [message, setMessage] = useState<string | null>(null)
  const [failures, setFailures] = useState<string[]>([])
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [applying, setApplying] = useState(false)
  const previewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (parsed) previewRef.current?.focus()
  }, [parsed])

  function handleExport() {
    const contracts = getContracts()
    const payload =
      exportMode === 'everything'
        ? buildBackup(
            contracts,
            gatherAlerts(),
            gatherSettings(),
            exportAllStorageData()
          )
        : buildSnapshot(contracts)
    const json = JSON.stringify(payload, null, 2)
    const url = URL.createObjectURL(
      new Blob([json], { type: 'application/json' })
    )
    const a = document.createElement('a')
    a.href = url
    a.download =
      exportMode === 'everything'
        ? 'txwatch-backup.json'
        : 'txwatch-contracts.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    setMessage(null)
    setFailures([])
    setParsed(null)
    setConfirmReplace(false)
    if (!file) return
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error('File is too large (max 5 MB).')
      }
      setParsed(parseImport(await file.text()))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not read file')
    } finally {
      // Allow re-selecting the same file after fixing an error.
      input.value = ''
    }
  }

  const plan = parsed
    ? planImport(getContracts(), parsed.contracts, mode, dupes)
    : null

  async function handleApply() {
    if (!plan) return
    if (mode === 'replace' && !confirmReplace) {
      setConfirmReplace(true)
      return
    }
    setApplying(true)
    setFailures([])
    const errors: string[] = []
    try {
      // Replace: re-key alerts for contracts matched by (contract_id, network)
      // instead of letting deleteContract cascade-delete them.
      const existing = getContracts()
      const toDelete = plan.toDeleteIds.filter(
        (id) => !plan.toSave.some((c) => c.id === id)
      )

      for (const id of toDelete) {
        const old = existing.find((c) => c.id === id)
        const replacement = old
          ? plan.toSave.find((c) => contractKey(c) === contractKey(old))
          : undefined
        if (old && replacement) {
          try {
            rekeyAlerts(old.id, replacement.id)
          } catch (err) {
            errors.push(
              `Alerts for ${old.contract_id}: ${err instanceof Error ? err.message : 're-key failed'}`
            )
          }
        }
        try {
          await syncDeleteContract(id)
        } catch (err) {
          errors.push(
            `Delete ${old?.contract_id ?? id}: ${err instanceof Error ? err.message : 'sync failed'}`
          )
        }
      }

      for (const contract of plan.toSave) {
        try {
          await syncSaveContract(contract)
        } catch (err) {
          errors.push(
            `Save ${contract.contract_id}: ${err instanceof Error ? err.message : 'sync failed'}`
          )
        }
      }

      if (parsed?.alerts) applyAlerts(parsed.alerts)
      if (parsed?.settings) applySettings(parsed.settings)

      setFailures(errors)
      setMessage(
        errors.length === 0
          ? `Imported ${plan.toSave.length} contract(s).`
          : `Imported with ${errors.length} error(s).`
      )
      setParsed(null)
      setConfirmReplace(false)
    } finally {
      setApplying(false)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Backup &amp; restore</h2>
      <div className="flex items-end gap-3">
        <label className="block text-sm text-zinc-400">
          Export
          <select
            value={exportMode}
            onChange={(e) => setExportMode(e.target.value as ExportMode)}
            className="block bg-zinc-900"
          >
            <option value="contracts">Contracts only</option>
            <option value="everything">Everything</option>
          </select>
        </label>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm"
        >
          Export
        </button>
      </div>
      <div>
        <label
          className="block text-sm text-zinc-400 mb-1"
          htmlFor="import-file"
        >
          Import contracts
        </label>
        <input
          id="import-file"
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
        />
      </div>

      {parsed && plan && (
        <div
          ref={previewRef}
          tabIndex={-1}
          className="rounded border border-zinc-800 p-4 space-y-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          data-testid="import-preview"
        >
          <p>
            {parsed.contracts.length} valid, {parsed.errors.length} invalid,{' '}
            {plan.duplicates.length} duplicate.
          </p>
          {plan.toSave.length > 0 && (
            <div>
              <p className="text-zinc-400">To add / overwrite:</p>
              <ul className="list-disc pl-5">
                {plan.toSave.map((c) => (
                  <li key={c.id}>
                    {c.contract_id} ({c.network})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.toDeleteIds.length > 0 && (
            <div>
              <p className="text-zinc-400">To delete:</p>
              <ul className="list-disc pl-5 text-red-400">
                {plan.toDeleteIds.map((id) => {
                  const c = getContracts().find((x) => x.id === id)
                  return (
                    <li key={id}>
                      {c ? `${c.contract_id} (${c.network})` : id}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {parsed.errors.length > 0 && (
            <ul className="text-red-400 list-disc pl-5">
              {parsed.errors.map((er) => (
                <li key={er.index}>
                  Entry {er.index + 1}: {er.message}
                </li>
              ))}
            </ul>
          )}
          <label className="block">
            Mode{' '}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ImportMode)}
              className="bg-zinc-900"
            >
              <option value="merge">Merge with existing</option>
              <option value="replace">Replace all existing</option>
            </select>
          </label>
          {mode === 'merge' && (
            <label className="block">
              Duplicates{' '}
              <select
                value={dupes}
                onChange={(e) => setDupes(e.target.value as DuplicateStrategy)}
                className="bg-zinc-900"
              >
                <option value="skip">Skip</option>
                <option value="overwrite">Overwrite</option>
              </select>
            </label>
          )}
          {mode === 'replace' && confirmReplace && (
            <p className="text-amber-400">
              Replace all existing contracts? This will delete the contracts
              listed above.
            </p>
          )}
          <button
            onClick={handleApply}
            disabled={
              applying ||
              (plan.toSave.length === 0 && plan.toDeleteIds.length === 0)
            }
            className="px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-50"
          >
            {mode === 'replace' && confirmReplace
              ? 'Confirm replace'
              : 'Apply import'}
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-zinc-300">
          {message}
        </p>
      )}
      {failures.length > 0 && (
        <ul className="text-sm text-red-400 list-disc pl-5">
          {failures.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

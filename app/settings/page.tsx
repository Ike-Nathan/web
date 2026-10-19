'use client'

import ContractImportExport from '@/components/ContractImportExport'
import RetentionSetting from '@/components/RetentionSetting'
import ApiKeySetting from '@/components/ApiKeySetting'
import { exportAllStorageData, clearTxWatchStorage } from '@/lib/storageKeys'

export default function SettingsPage() {
  const handleExport = () => {
    exportAllStorageData()
  }

  const handleReset = () => {
    const confirmed = window.confirm(
      'This will remove all TxWatch data (contracts, alerts, preferences) from this browser. ' +
        'Other apps on this origin will not be affected. Continue?'
    )
    if (!confirmed) return
    clearTxWatchStorage()
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <ContractImportExport />
      <RetentionSetting />
      <ApiKeySetting />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Data Management</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Download backup
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Reset app data
          </button>
        </div>
      </section>
    </div>
  )
}

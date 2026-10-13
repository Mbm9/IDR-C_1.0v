'use client'

import { useState } from 'react'
import { Download, Loader2, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { generateCsv, downloadCsv, type CsvColumn } from '@/lib/utils/csv-export'

interface CsvExportButtonProps {
  filename: string
  columns: CsvColumn[]
  fetchData: () => Promise<Record<string, unknown>[]>
  label?: string
}

export function CsvExportButton({ filename, columns, fetchData, label }: CsvExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const t = useTranslations('exportButtons')

  const handleExport = async () => {
    setLoading(true)
    setFailed(false)
    try {
      const rows = await fetchData()
      const csv = generateCsv(columns, rows)
      const dateSuffix = new Date().toISOString().split('T')[0]
      downloadCsv(`${filename}-${dateSuffix}.csv`, csv)
    } catch (err) {
      console.error('CSV export failed:', err)
      setFailed(true)
      setTimeout(() => setFailed(false), 4000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      aria-busy={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-medium hover:bg-[var(--bg-secondary)] disabled:opacity-50 transition-colors"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        : failed
          ? <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--color-critical)' }} aria-hidden="true" />
          : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
      <span aria-live="polite">{failed ? t('csvFailed') : (label || t('exportCsv'))}</span>
    </button>
  )
}

'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Download, Loader2 } from 'lucide-react'
import { generateCsv, downloadCsv, type CsvColumn } from '@/lib/utils/csv-export'

interface CsvExportButtonProps {
  filename: string
  columns: CsvColumn[]
  fetchData: () => Promise<Record<string, unknown>[]>
  label?: string
}

export function CsvExportButton({ filename, columns, fetchData, label }: CsvExportButtonProps) {
  const t = useTranslations('ui')
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const rows = await fetchData()
      const csv = generateCsv(columns, rows)
      const dateSuffix = new Date().toISOString().split('T')[0]
      downloadCsv(`${filename}-${dateSuffix}.csv`, csv)
    } catch (err) {
      console.error('CSV export failed:', err)
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
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-secondary)] text-xs font-medium hover:bg-[var(--bg-secondary)] disabled:opacity-50 transition-colors"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
      {label || t('exportCsv')}
    </button>
  )
}

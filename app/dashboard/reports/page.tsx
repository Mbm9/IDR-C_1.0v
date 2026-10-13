'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { FileText, Printer, Loader2, Calendar } from 'lucide-react'

export default function ReportsPage() {
  const t = useTranslations('reports')
  const [days, setDays] = useState(30)
  const [generating, setGenerating] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['executive-report', days],
    queryFn: async () => {
      const res = await fetch(`/api/reports/executive?days=${days}`)
      if (!res.ok) throw new Error('Failed to generate report')
      return res.json()
    },
    enabled: false,
  })

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await refetch()
    } finally {
      setGenerating(false)
    }
  }

  const handlePrint = () => {
    if (!data?.html) return
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(data.html)
      printWindow.document.close()
      printWindow.onload = () => {
        printWindow.print()
      }
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[var(--text-secondary)]" aria-hidden="true" />
          <label htmlFor="report-period" className="text-caption text-[var(--text-secondary)]">{t('period')}</label>
          <select
            id="report-period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-caption bg-[var(--bg-primary)] text-[var(--text-primary)]"
          >
            <option value={30}>{t('last30Days')}</option>
            <option value={60}>{t('last60Days')}</option>
            <option value={90}>{t('last90Days')}</option>
          </select>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {(generating || isLoading) ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
          {(generating || isLoading) ? t('generating') : t('generateReport')}
        </button>

        {data?.html && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 border border-[var(--border-default)] rounded-[var(--radius-button)] text-body font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <Printer size={14} aria-hidden="true" />
            {t('printPdf')}
          </button>
        )}
      </div>

      {/* Report Preview */}
      {data?.html ? (
        <div
          dir="ltr"
          lang="en"
          className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-white text-slate-900 overflow-hidden"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div
            className="p-6"
            dangerouslySetInnerHTML={{ __html: data.html }}
          />
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-12 text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
          <FileText size={40} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-40" aria-hidden="true" />
          <p className="text-body text-[var(--text-primary)]">{t('noReport')}</p>
          <p className="text-caption text-[var(--text-secondary)] mt-1">{t('noReportHint')}</p>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Check, AlertTriangle, HelpCircle, RotateCcw } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

/** Target identity fields; labels are message keys under import.previewFields ('' = unmapped). */
const TARGET_FIELDS = [
  '',
  'displayName',
  'type',
  'subType',
  'upn',
  'samAccountName',
  'email',
  'department',
  'status',
  'adTier',
  'sourceId',
  'lastLogonAt',
  'passwordLastSetAt',
  'createdInSourceAt',
  'managerDn',
  'memberOf',
] as const

interface CSVMappingPreviewProps {
  headers: string[]
  sampleRows: string[][]
  mapping: Record<string, string>
  confidence: Record<string, number>
  formatDetection: { dateFormat: string; csvType: string }
  unmapped: string[]
  onConfirm: (mapping: Record<string, string>) => void
  onReset: () => void
  loading?: boolean
}

export function CSVMappingPreview({
  headers,
  sampleRows,
  mapping: initialMapping,
  confidence,
  formatDetection,
  unmapped: _unmapped,
  onConfirm,
  onReset,
  loading,
}: CSVMappingPreviewProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping)
  const t = useTranslations('import')
  const format = useFormatter()

  const handleFieldChange = (sourceCol: string, targetField: string) => {
    setMapping(prev => {
      const next = { ...prev }
      if (targetField === '') {
        delete next[sourceCol]
      } else {
        // Remove duplicate mappings to the same target
        for (const key of Object.keys(next)) {
          if (next[key] === targetField && key !== sourceCol) {
            delete next[key]
          }
        }
        next[sourceCol] = targetField
      }
      return next
    })
  }

  const getConfidenceColor = (col: string): string => {
    const conf = confidence[col]
    if (conf === undefined || !mapping[col]) return 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
    if (conf >= 80) return 'bg-[var(--color-low-bg)] text-[var(--text-primary)]'
    if (conf >= 50) return 'bg-[var(--color-medium-bg)] text-[var(--text-primary)]'
    return 'bg-[var(--color-high-bg)] text-[var(--text-primary)]'
  }

  const getConfidenceIcon = (col: string) => {
    const conf = confidence[col]
    if (conf === undefined || !mapping[col]) return <HelpCircle size={14} aria-hidden="true" />
    if (conf >= 80) return <Check size={14} style={{ color: 'var(--color-low)' }} aria-hidden="true" />
    if (conf >= 50) return <AlertTriangle size={14} style={{ color: 'var(--color-medium)' }} aria-hidden="true" />
    return <AlertTriangle size={14} style={{ color: 'var(--color-high)' }} aria-hidden="true" />
  }

  const getSampleValue = (colIndex: number): string => {
    for (const row of sampleRows) {
      if (row[colIndex] && row[colIndex].trim()) {
        const val = row[colIndex].trim()
        return val.length > 40 ? val.slice(0, 37) + '...' : val
      }
    }
    return '-'
  }

  const mappedCount = Object.keys(mapping).length
  const hasDisplayName = Object.values(mapping).includes('displayName')

  return (
    <div className="space-y-4">
      {/* Format detection badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="px-2.5 py-1 rounded-[var(--radius-badge)] text-caption font-medium bg-[var(--color-info-bg)] text-[var(--text-primary)]" dir="ltr">
          {formatDetection.csvType.replace(/_/g, ' ').toUpperCase()}
        </span>
        <span className="px-2.5 py-1 rounded-[var(--radius-badge)] text-caption font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
          {t('dateFormat', { format: formatDetection.dateFormat.replace(/_/g, ' ') })}
        </span>
        <span className="text-caption text-[var(--text-secondary)]">
          {t('columnsMapped', { mapped: mappedCount, total: headers.length })}
        </span>
      </div>

      {/* Mapping table */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="bg-[var(--bg-tertiary)]">
                <th scope="col" className="text-start px-4 py-2.5 text-caption font-semibold text-[var(--text-secondary)]">{t('sourceColumn')}</th>
                <th scope="col" className="text-start px-4 py-2.5 text-caption font-semibold text-[var(--text-secondary)]">{t('sampleValue')}</th>
                <th scope="col" className="text-start px-4 py-2.5 text-caption font-semibold text-[var(--text-secondary)]">{t('targetField')}</th>
                <th scope="col" className="text-center px-4 py-2.5 text-caption font-semibold text-[var(--text-secondary)]">{t('confidence')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {headers.map((header, idx) => (
                <tr key={header} className="bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-caption text-[var(--text-primary)]" dir="ltr">{header}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <bdi className="text-caption text-[var(--text-secondary)] font-mono">{getSampleValue(idx)}</bdi>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={mapping[header] || ''}
                      onChange={(e) => handleFieldChange(header, e.target.value)}
                      aria-label={t('mapColumn', { column: header })}
                      className="w-full px-2 py-1.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-caption bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent"
                    >
                      {TARGET_FIELDS.map(f => (
                        <option key={f} value={f}>{f ? t(`previewFields.${f}`) : t('unmappedOption')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {mapping[header] ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium ${getConfidenceColor(header)}`}>
                        {getConfidenceIcon(header)}
                        {confidence[header] !== undefined ? format.number(confidence[header] / 100, { style: 'percent' }) : t('manualMapping')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-caption font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                        {t('unmapped')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Validation warning */}
      {!hasDisplayName && (
        <div role="alert" className="px-4 py-3 rounded-[var(--radius-card)] text-caption font-medium flex items-center gap-2 border text-[var(--text-primary)]" style={{ backgroundColor: 'var(--color-high-bg)', borderColor: 'var(--color-high)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-high)' }} aria-hidden="true" />
          {t('displayNameRequired')}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-caption font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RotateCcw size={14} aria-hidden="true" />
          {t('reset')}
        </button>
        <button
          onClick={() => onConfirm(mapping)}
          disabled={!hasDisplayName || loading}
          className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
          ) : (
            <Check size={16} aria-hidden="true" />
          )}
          {t('confirmMapping')}
        </button>
      </div>
    </div>
  )
}

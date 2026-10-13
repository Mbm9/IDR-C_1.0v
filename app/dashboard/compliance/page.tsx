'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, MinusCircle, Download,
} from 'lucide-react'
import { useState } from 'react'

interface ControlResult {
  id: string
  name: string
  description: string
  category: string
  coveredBy: string[]
  relatedViolations: string[]
  assessmentMethod: string
  status: 'compliant' | 'partial' | 'non_compliant' | 'not_assessed'
  relatedViolationCounts: Record<string, number>
}

interface FrameworkResult {
  key: string
  name: string
  fullName: string
  version: string
  score: number
  summary: {
    compliant: number
    partial: number
    nonCompliant: number
    notAssessed: number
    total: number
  }
  controls: ControlResult[]
}

const STATUS_CONFIG = {
  compliant: { icon: CheckCircle2, color: 'var(--color-low-text)' },
  partial: { icon: AlertTriangle, color: 'var(--color-medium-text)' },
  non_compliant: { icon: XCircle, color: 'var(--color-critical-text)' },
  not_assessed: { icon: MinusCircle, color: 'var(--text-secondary)' },
} as const

const CATEGORY_KEYS: Record<string, string> = {
  'Access Control': 'accessControl',
  'Asset Management': 'assetManagement',
  'Audit': 'audit',
  'Data Governance': 'dataGovernance',
  'Identity & Access Management': 'iam',
  'Incident Response': 'incidentResponse',
  'Risk Management': 'riskManagement',
  'Security Monitoring': 'securityMonitoring',
  'Security Operations': 'securityOperations',
  'Third-Party Risk': 'thirdPartyRisk',
}
const FRAMEWORK_KEYS = ['NCA_ECC', 'SAMA_CSF', 'PDPL']

function scoreColor(score: number) {
  return score >= 80 ? 'var(--color-low)' : score >= 50 ? 'var(--color-medium)' : 'var(--color-critical)'
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const format = useFormatter()
  return (
    <div className="relative w-24 h-24 shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border-default)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="42" fill="none"
          stroke={scoreColor(score)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${score * 2.64} ${264 - score * 2.64}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="text-2xl font-bold text-[var(--text-primary)]">{format.number(score / 100, { style: 'percent' })}</span>
      </div>
    </div>
  )
}

export default function CompliancePage() {
  const t = useTranslations('compliance')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['compliance'],
    queryFn: async () => {
      const res = await fetch('/api/compliance')
      if (!res.ok) throw new Error('Failed to fetch compliance data')
      return res.json()
    },
  })

  const handleDownloadReport = async (frameworkKey: string) => {
    setGenerating(true)
    setDownloadError(null)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: `compliance_${frameworkKey.toLowerCase().replace('_', '')}` }),
      })
      if (!res.ok) throw new Error('Failed to generate report')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `compliance-${frameworkKey.toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError(t('downloadFailed'))
    } finally {
      setGenerating(false)
    }
  }

  const frameworks: FrameworkResult[] = data?.frameworks || []
  const activeFramework = selectedFramework
    ? frameworks.find(f => f.key === selectedFramework)
    : null

  const fullName = (fw: FrameworkResult) => FRAMEWORK_KEYS.includes(fw.key) ? t(`frameworks.${fw.key}`) : fw.fullName
  const categoryLabel = (c: string) => CATEGORY_KEYS[c] ? t(`categories.${CATEGORY_KEYS[c]}`) : c

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="status" aria-busy="true" aria-label={tCommon('loading')}>
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-xl bg-[var(--bg-secondary)] animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
        <p className="text-sm text-[var(--text-primary)]" role="alert">
          {tCommon('error')} <button onClick={() => refetch()} className="underline">{tCommon('tryAgain')}</button>
        </p>
      </div>
    )
  }

  const metrics = data?.metrics
  const mfaPct = metrics && metrics.mfaTotal > 0 ? metrics.mfaEnabled / metrics.mfaTotal : null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title text-[var(--text-primary)] flex items-center gap-2">
            <Shield className="w-6 h-6 text-[var(--color-info-text)]" aria-hidden="true" />
            {t('title')}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t('subtitle')}
          </p>
        </div>
        {data?.assessedAt && (
          <span className="text-xs text-[var(--text-secondary)]">
            {t('assessedAt', { date: format.dateTime(new Date(data.assessedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}
          </span>
        )}
      </div>

      {/* Framework Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {frameworks.map(fw => {
          const selected = selectedFramework === fw.key
          return (
            <button
              key={fw.key}
              onClick={() => setSelectedFramework(selected ? null : fw.key)}
              aria-expanded={selected}
              aria-controls="framework-detail"
              className={`p-6 rounded-xl border text-start transition-all ${
                selected
                  ? 'border-[var(--color-info)] bg-[var(--color-info-bg)]'
                  : 'border-[var(--border-default)] bg-[var(--bg-secondary)] hover:border-[var(--border-hover)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[var(--text-primary)]" dir="ltr">{fw.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{fullName(fw)}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{t('version', { version: fw.version })}</p>
                </div>
                <ScoreGauge score={fw.score} label={t('scoreLabel', { name: fw.name, percent: format.number(fw.score / 100, { style: 'percent' }) })} />
              </div>

              <ul className="flex flex-wrap gap-3 mt-4 text-xs text-[var(--text-primary)]">
                {([
                  ['compliant', fw.summary.compliant],
                  ['partial', fw.summary.partial],
                  ['non_compliant', fw.summary.nonCompliant],
                  ['not_assessed', fw.summary.notAssessed],
                ] as const).map(([status, count]) => {
                  const Icon = STATUS_CONFIG[status].icon
                  return (
                    <li key={status} className="flex items-center gap-1" title={t(`status.${status}`)}>
                      <Icon className="w-3 h-3" style={{ color: STATUS_CONFIG[status].color }} aria-hidden="true" />
                      <span className="sr-only">{t(`status.${status}`)}:</span> {count}
                    </li>
                  )
                })}
              </ul>
            </button>
          )
        })}
      </div>

      {/* Expanded Framework Detail */}
      {activeFramework && (
        <div className="space-y-4" id="framework-detail">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {t('controlDetails', { framework: fullName(activeFramework) })}
            </h3>
            <button
              onClick={() => handleDownloadReport(activeFramework.key)}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-info)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {generating ? t('generating') : t('downloadPdf')}
            </button>
          </div>
          {downloadError && <p className="text-sm text-[var(--text-primary)] rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-critical)' }} role="alert">{downloadError}</p>}

          {/* Group by category */}
          {Object.entries(
            activeFramework.controls.reduce<Record<string, ControlResult[]>>((acc, c) => {
              ;(acc[c.category] ||= []).push(c)
              return acc
            }, {})
          ).map(([category, controls]) => (
            <section key={category} aria-label={categoryLabel(category)}>
              <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
                {categoryLabel(category)}
              </h4>
              <ul className="space-y-2">
                {controls.map(control => {
                  const cfg = STATUS_CONFIG[control.status]
                  const Icon = cfg.icon
                  return (
                    <li
                      key={control.id}
                      className="flex items-start gap-3 p-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)]"
                    >
                      <div className="p-1.5 rounded-lg bg-[var(--bg-tertiary)]">
                        <Icon className="w-4 h-4" style={{ color: cfg.color }} aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-[var(--text-secondary)]" dir="ltr">{control.id}</span>
                          <span className="font-medium text-sm text-[var(--text-primary)]">{control.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full border text-[var(--text-primary)]" style={{ borderColor: cfg.color }}>
                            {t(`status.${control.status}`)}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">{control.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {control.coveredBy.map(feature => (
                            <span
                              key={feature}
                              className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                        {Object.entries(control.relatedViolationCounts).some(([, v]) => v > 0) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {Object.entries(control.relatedViolationCounts)
                              .filter(([, v]) => v > 0)
                              .map(([type, count]) => (
                                <span key={type} className="text-[11px] px-2 py-0.5 rounded-full border text-[var(--text-primary)]" style={{ borderColor: 'var(--color-critical)' }}>
                                  <bdi dir="ltr">{type.replace(/_/g, ' ')}</bdi>: {format.number(count)}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* System Metrics Summary */}
      {metrics && (
        <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('metricsTitle')}</h3>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { key: 'totalIdentities', value: metrics.totalIdentities },
              { key: 'tierViolations', value: metrics.tierViolations, warn: true },
              { key: 'orphanedNhis', value: metrics.orphanedNhis, warn: true },
              { key: 'dormantIdentities', value: metrics.dormantIdentities, warn: true },
              { key: 'mfaCoverage', value: mfaPct },
              { key: 'certOverdue', value: metrics.certOverdue, warn: true },
              { key: 'auditEntries', value: metrics.auditEntries },
              { key: 'openViolations', value: Object.values(metrics.violations as Record<string, number>).reduce((a: number, b: number) => a + b, 0) },
            ].map(m => (
              <div key={m.key} className="flex flex-col-reverse">
                <dt className="text-xs text-[var(--text-secondary)]">{t(`metrics.${m.key}`)}</dt>
                <dd className="text-xl font-bold text-[var(--text-primary)] flex items-center justify-center gap-1.5">
                  {m.warn && typeof m.value === 'number' && m.value > 0 && (
                    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-medium-text)' }} aria-hidden="true" />
                  )}
                  {m.value == null
                    ? tCommon('na')
                    : m.key === 'mfaCoverage'
                      ? format.number(m.value as number, { style: 'percent' })
                      : format.number(m.value as number)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

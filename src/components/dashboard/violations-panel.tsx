'use client'

import { useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useViolationList } from '@/lib/hooks/use-violations'
import { MetricCard } from '@/components/ui/metric-card'
import { RiskGauge } from '@/components/ui/risk-gauge'
import { ViolationBreakdown } from '@/components/charts/violation-breakdown'
import { ViolationTable } from '@/components/dashboard/violation-table'
import { useEnumLabel } from '@/components/ui/enum-label'
import { TONE_TEXT } from '@/components/ui/tone'
import { formatRelativeTime } from '@/lib/utils/formatters'
import Link from 'next/link'

const VIOLATION_TYPES = [
  'tier_breach', 'sod_conflict', 'excessive_privilege', 'dormant_access',
  'orphaned_identity', 'missing_mfa', 'expired_certification', 'password_age',
  'kerberoastable', 'asrep_roastable', 'unconstrained_delegation', 'constrained_delegation',
  'reversible_encryption', 'password_not_required', 'password_never_expires', 'stale_privileged_account',
] as const

/** Individual policy violations: summary, filters, feed and exceptions. Shown in Issues → Individual violations. */
export function ViolationsPanel() {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const t = useTranslations('violations')
  const tSeverity = useTranslations('severity')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const label = useEnumLabel()

  const { data, isLoading, error } = useViolationList({ ...filters, page, pageSize: 25 })

  const handleFilter = useCallback((key: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev }
      if (!value) delete next[key]
      else next[key] = value
      return next
    })
    setPage(1)
  }, [])

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="bg-[var(--color-critical-bg)] border border-[var(--color-critical)] rounded-xl p-6">
          <p className={`font-medium ${TONE_TEXT.critical}`}>{t('failedToLoad')}</p>
        </div>
      </div>
    )
  }

  const { summary, exceptions } = data

  return (
    <div className="space-y-6">
      {/* Severity summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={tSeverity('critical')} value={summary.bySeverity.critical || 0} color="red" />
        <MetricCard label={tSeverity('high')} value={summary.bySeverity.high || 0} color="orange" />
        <MetricCard label={tSeverity('medium')} value={summary.bySeverity.medium || 0} color="blue" />
        <MetricCard label={tSeverity('low')} value={summary.bySeverity.low || 0} color="green" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('violationTypes')}</h3>
          <ViolationBreakdown byType={summary.byType} />
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 flex flex-col items-center justify-center" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4 self-start">{t('remediationRate')}</h3>
          <RiskGauge score={summary.remediationRate} label={t('violationsRemediated')} size="lg" higherIsBetter />
          <div className="grid grid-cols-3 gap-4 mt-6 text-center w-full">
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">{summary.byStatus.open || 0}</p>
              <p className="text-xs text-[var(--text-secondary)]">{tCommon('open')}</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${TONE_TEXT.low}`}>{summary.byStatus.remediated || 0}</p>
              <p className="text-xs text-[var(--text-secondary)]">{tCommon('remediated')}</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${TONE_TEXT.info}`}>{summary.byStatus.excepted || 0}</p>
              <p className="text-xs text-[var(--text-secondary)]">{tCommon('excepted')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Violation feed with filters */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="p-4 border-b border-[var(--border-default)] flex flex-wrap gap-2">
          <select
            value={filters.violationType || ''}
            onChange={(e) => handleFilter('violationType', e.target.value)}
            aria-label={t('filterType')}
            className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] max-w-full"
          >
            <option value="">{t('allTypes')}</option>
            {VIOLATION_TYPES.map((type) => (
              <option key={type} value={type}>{label('violationType', type)}</option>
            ))}
          </select>
          <select
            value={filters.severity || ''}
            onChange={(e) => handleFilter('severity', e.target.value)}
            aria-label={t('filterSeverity')}
            className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)]"
          >
            <option value="">{tSeverity('allSeverities')}</option>
            <option value="critical">{tSeverity('critical')}</option>
            <option value="high">{tSeverity('high')}</option>
            <option value="medium">{tSeverity('medium')}</option>
            <option value="low">{tSeverity('low')}</option>
          </select>
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilter('status', e.target.value)}
            aria-label={t('filterStatus')}
            className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)]"
          >
            <option value="">{t('allStatuses')}</option>
            <option value="open">{tCommon('open')}</option>
            <option value="acknowledged">{tCommon('acknowledged')}</option>
            <option value="remediated">{tCommon('remediated')}</option>
            <option value="excepted">{tCommon('excepted')}</option>
            <option value="false_positive">{tCommon('falsePositive')}</option>
          </select>
          <span className="flex items-center text-sm text-[var(--text-secondary)]" role="status">
            {t('violationsCount', { count: data.total })}
          </span>
        </div>

        <ViolationTable violations={data.data} />

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-default)]">
            <p className="text-sm text-[var(--text-secondary)]">{t('pageOf', { page, total: totalPages })}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-lg disabled:opacity-50 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
              >
                {tCommon('previous')}
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-lg disabled:opacity-50 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
              >
                {tCommon('next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Exception tracker */}
      {exceptions.length > 0 && (
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            {t('activeExceptionsCount', { count: exceptions.length })}
          </h3>
          <div className="space-y-3">
            {exceptions.map((exc) => (
              <div key={exc.id} className="flex items-center justify-between gap-3 p-3 bg-[var(--color-info-bg)] rounded-lg">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/identities/${exc.identityId}`}
                    className={`text-sm font-medium hover:underline ${TONE_TEXT.info}`}
                  >
                    <bdi>{exc.identityName}</bdi>
                  </Link>
                  <p className="text-xs text-[var(--text-primary)] mt-0.5">
                    {label('violationType', exc.violationType)}{exc.exceptionReason ? <> — <bdi>{exc.exceptionReason}</bdi></> : null}
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="text-xs text-[var(--text-primary)]">{t('expires')}</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {exc.exceptionExpiresAt ? formatRelativeTime(exc.exceptionExpiresAt, locale) : tCommon('na')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

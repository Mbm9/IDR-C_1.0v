'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MetricCard } from '@/components/ui/metric-card'
import { useAppRole } from '@/lib/hooks/use-app-role'

// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const TONE = {
  critical: 'bg-[var(--color-critical-bg)] text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]',
  high: 'bg-[var(--color-high-bg)] text-[color:color-mix(in_srgb,var(--color-high)_60%,var(--text-primary))]',
  medium: 'bg-[var(--color-medium-bg)] text-[color:color-mix(in_srgb,var(--color-medium)_60%,var(--text-primary))]',
  low: 'bg-[var(--color-low-bg)] text-[color:color-mix(in_srgb,var(--color-low)_60%,var(--text-primary))]',
  info: 'bg-[var(--color-info-bg)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))]',
  neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
} as const
const riskText = (score: number) =>
  `color-mix(in srgb, var(--color-${score >= 80 ? 'critical' : score >= 60 ? 'high' : 'medium'}) 60%, var(--text-primary))`

const METHOD_KEYS: Record<string, string> = {
  acl_analysis: 'aclAnalysis', delegation_chain: 'delegationChain', nested_group: 'nestedGroup',
  svc_ownership: 'svcOwnership', gpo_rights: 'gpoRights',
}

interface ShadowAdmin {
  id: string
  identityId: string
  identityName: string
  identityType: string
  identityTier: string
  detectionMethod: string
  detectionReasons: string[]
  effectiveRights: string[]
  equivalentToGroups: string[]
  riskScore: number
  status: string
  detectedAt: string
}

interface ShadowData {
  items: ShadowAdmin[]
  summary: {
    total: number
    byStatus: Record<string, number>
    byMethod: Record<string, number>
  }
}

export default function ShadowAdminsPage() {
  const t = useTranslations('shadowAdmins')
  const tCommon = useTranslations('common')
  const tGate = useTranslations('roleGate')
  const { can } = useAppRole()
  // POST /api/shadow-admins and PATCH /api/shadow-admins/[id] require analyst
  const canAct = can('analyst')
  const methodLabel = (m: string) => (METHOD_KEYS[m] ? t(METHOD_KEYS[m]) : m.replace(/_/g, ' '))
  const statusLabel = (s: string) => (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s.replace(/_/g, ' '))

  const [data, setData] = useState<ShadowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (methodFilter) params.set('detectionMethod', methodFilter)
      const res = await fetch(`/api/shadow-admins?${params}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // error
    } finally {
      setLoading(false)
    }
  }, [statusFilter, methodFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const runScan = useCallback(async () => {
    setScanning(true)
    try {
      await fetch('/api/shadow-admins', { method: 'POST' })
      await fetchData()
    } finally {
      setScanning(false)
    }
  }, [fetchData])

  const updateStatus = useCallback(async (id: string, status: string) => {
    await fetch(`/api/shadow-admins/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await fetchData()
  }, [fetchData])

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const summary = data?.summary || { total: 0, byStatus: {}, byMethod: {} }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <button
          onClick={canAct ? runScan : undefined}
          disabled={scanning}
          aria-disabled={!canAct || undefined}
          title={canAct ? undefined : tGate('requiresRole', { role: tGate('roles.analyst') })}
          className="px-4 py-2 bg-[var(--color-info)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
        >
          {scanning ? t('scanning') : t('runScan')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={t('totalShadowAdmins')} value={summary.total} color="red" />
        <MetricCard label={t('openCount')} value={summary.byStatus.open || 0} color="orange" />
        <MetricCard label={t('confirmedCount')} value={summary.byStatus.confirmed || 0} color="blue" />
        <MetricCard label={t('remediatedCount')} value={summary.byStatus.remediated || 0} color="green" />
      </div>

      {/* Detection method breakdown */}
      {Object.keys(summary.byMethod).length > 0 && (
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{t('byMethod')}</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(summary.byMethod).map(([method, count]) => (
              <div key={method} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-lg">
                <span className="text-sm text-[var(--text-primary)] font-medium">{methodLabel(method)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${TONE.info}`}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="p-4 border-b border-[var(--border-default)] flex flex-wrap gap-2">
          <select
            aria-label={t('statusFilter')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)]"
          >
            <option value="">{tCommon('all')}</option>
            <option value="open">{tCommon('open')}</option>
            <option value="confirmed">{t('confirmed')}</option>
            <option value="dismissed">{t('dismissed')}</option>
            <option value="remediated">{tCommon('remediated')}</option>
          </select>
          <select
            aria-label={t('methodFilter')}
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)]"
          >
            <option value="">{t('allMethods')}</option>
            <option value="acl_analysis">{t('aclAnalysis')}</option>
            <option value="delegation_chain">{t('delegationChain')}</option>
            <option value="nested_group">{t('nestedGroup')}</option>
            <option value="svc_ownership">{t('svcOwnership')}</option>
            <option value="gpo_rights">{t('gpoRights')}</option>
          </select>
        </div>

        <div tabIndex={0} role="region" aria-label={t('title')} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('identity')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('method')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('effectiveRights')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('equivalentGroups')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('riskScore')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('statusCol')}</th>
                {canAct && <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((sa) => {
                const expanded = expandedId === sa.id
                return (
                <Fragment key={sa.id}>
                  <tr
                    className="border-b border-[var(--border-default)] hover:bg-[var(--bg-secondary)] cursor-pointer"
                    onClick={() => setExpandedId(expanded ? null : sa.id)}
                  >
                    <td className="py-3 px-4 text-[var(--text-primary)] font-medium">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : sa.id) }}
                        className="inline-flex items-center gap-1 text-start"
                      >
                        {expanded
                          ? <ChevronDown aria-hidden size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                          : <ChevronRight aria-hidden size={14} className="text-[var(--text-secondary)] flex-shrink-0 rtl:-scale-x-100" />}
                        <bdi>{sa.identityName}</bdi>
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs bg-[var(--bg-secondary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full whitespace-nowrap">{methodLabel(sa.detectionMethod)}</span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] max-w-[200px] truncate"><bdi>{sa.effectiveRights.join(', ')}</bdi></td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] max-w-[200px] truncate"><bdi>{sa.equivalentToGroups.join(', ')}</bdi></td>
                    <td className="py-3 px-4">
                      <span className="font-medium" style={{ color: riskText(sa.riskScore) }}>
                        {sa.riskScore}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        sa.status === 'open' ? TONE.critical :
                        sa.status === 'confirmed' ? TONE.high :
                        sa.status === 'remediated' ? TONE.low : TONE.neutral
                      }`}>
                        {statusLabel(sa.status)}
                      </span>
                    </td>
                    {canAct && (
                    <td className="py-3 px-4">
                      {sa.status === 'open' && (
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(sa.id, 'confirmed') }}
                            className="px-2 py-1 text-xs bg-[var(--color-info)] text-white rounded"
                          >
                            {t('confirm')}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(sa.id, 'dismissed') }}
                            className="px-2 py-1 text-xs border border-[var(--border-default)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-secondary)]"
                          >
                            {t('dismiss')}
                          </button>
                        </div>
                      )}
                    </td>
                    )}
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={canAct ? 7 : 6} className="px-4 py-3 bg-[var(--bg-secondary)]">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{t('evidenceChain')}</p>
                          <ul className="list-disc list-inside text-sm text-[var(--text-secondary)] space-y-1">
                            {sa.detectionReasons.map((reason, idx) => (
                              <li key={idx}><bdi>{reason}</bdi></li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {(data?.items || []).length === 0 && (
          <div className="p-8 text-center text-[var(--text-secondary)]">
            {t('noShadowAdmins')}
          </div>
        )}
      </div>
    </div>
  )
}

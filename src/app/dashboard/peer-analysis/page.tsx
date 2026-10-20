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

interface PeerGroup {
  id: string
  name: string
  department: string
  adTier: string
  subType: string
  memberCount: number
  medianEntitlementCount: number
  avgEntitlementCount: number
  stddevEntitlementCount: number
}

interface PeerAnomaly {
  id: string
  identityId: string
  identityName: string
  identityTier: string
  identityDepartment: string
  peerGroupId: string
  peerGroupName: string
  anomalyType: string
  entitlementCount: number
  peerMedian: number
  deviationScore: number
  excessEntitlements: any[]
  uniqueEntitlements: any[]
  status: string
  detectedAt: string
}

export default function PeerAnalysisPage() {
  const t = useTranslations('peerAnalysis')
  const tTiers = useTranslations('tiers')
  const tGate = useTranslations('roleGate')
  const { can } = useAppRole()
  // POST /api/peer-groups and PATCH /api/peer-anomalies/[id] require analyst
  const canAct = can('analyst')
  const statusLabel = (s: string) => (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s.replace(/_/g, ' '))
  const tierLabel = (tier: string) => (tier && tTiers.has(tier) ? tTiers(tier) : String(tier ?? '').replace('_', ' '))

  const [peerGroups, setPeerGroups] = useState<PeerGroup[]>([])
  const [anomalies, setAnomalies] = useState<PeerAnomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [expandedAnomaly, setExpandedAnomaly] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [groupRes, anomalyRes] = await Promise.all([
        fetch('/api/peer-groups'),
        fetch('/api/peer-anomalies'),
      ])
      if (groupRes.ok) {
        const gd = await groupRes.json()
        setPeerGroups(gd.items || [])
      }
      if (anomalyRes.ok) {
        const ad = await anomalyRes.json()
        setAnomalies(ad.items || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const recompute = useCallback(async () => {
    setComputing(true)
    try {
      await fetch('/api/peer-groups', { method: 'POST' })
      await fetchData()
    } finally {
      setComputing(false)
    }
  }, [fetchData])

  const updateAnomalyStatus = useCallback(async (id: string, status: string) => {
    await fetch(`/api/peer-anomalies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await fetchData()
  }, [fetchData])

  const avgDeviation = anomalies.length > 0
    ? (anomalies.reduce((s, a) => s + a.deviationScore, 0) / anomalies.length).toFixed(1)
    : '0'

  if (loading && peerGroups.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <button
          onClick={canAct ? recompute : undefined}
          disabled={computing}
          aria-disabled={!canAct || undefined}
          title={canAct ? undefined : tGate('requiresRole', { role: tGate('roles.analyst') })}
          className="px-4 py-2 bg-[var(--color-info)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
        >
          {computing ? t('computing') : t('recompute')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label={t('totalPeerGroups')} value={peerGroups.length} color="blue" />
        <MetricCard label={t('totalAnomalies')} value={anomalies.length} color="orange" />
        <MetricCard label={t('avgDeviation')} value={avgDeviation} color="red" />
      </div>

      {/* Peer group cards */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('peerGroupsTitle')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {peerGroups.slice(0, 12).map((pg) => {
            const groupAnomalies = anomalies.filter(a => a.peerGroupId === pg.id).length
            return (
              <div key={pg.id} className="border border-[var(--border-default)] rounded-lg p-3">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate"><bdi>{pg.name}</bdi></p>
                <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                  <span className="text-xs text-[var(--text-secondary)]">{t('membersCount', { count: pg.memberCount })}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{t('median')}: {pg.medianEntitlementCount.toFixed(0)}</span>
                  {groupAnomalies > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TONE.high}`}>
                      {t('anomaliesCount', { count: groupAnomalies })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Anomaly table */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="p-4 border-b border-[var(--border-default)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">{t('anomaliesTitle')}</h3>
        </div>
        <div tabIndex={0} role="region" aria-label={t('anomaliesTitle')} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('identity')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('peerGroup')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('entitlements')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('vsMedian')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('deviation')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('statusCol')}</th>
                {canAct && <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {anomalies.map((anomaly) => {
                const expanded = expandedAnomaly === anomaly.id
                return (
                <Fragment key={anomaly.id}>
                  <tr
                    className="border-b border-[var(--border-default)] hover:bg-[var(--bg-secondary)] cursor-pointer"
                    onClick={() => setExpandedAnomaly(expanded ? null : anomaly.id)}
                  >
                    <td className="py-3 px-4 text-[var(--text-primary)] font-medium">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={(e) => { e.stopPropagation(); setExpandedAnomaly(expanded ? null : anomaly.id) }}
                        className="inline-flex items-center gap-1 text-start"
                      >
                        {expanded
                          ? <ChevronDown aria-hidden size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                          : <ChevronRight aria-hidden size={14} className="text-[var(--text-secondary)] flex-shrink-0 rtl:-scale-x-100" />}
                        <bdi>{anomaly.identityName}</bdi>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] text-xs"><bdi>{anomaly.peerGroupName}</bdi></td>
                    <td className="py-3 px-4 text-[var(--text-primary)] font-semibold">{anomaly.entitlementCount}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{anomaly.peerMedian.toFixed(0)}</td>
                    <td className="py-3 px-4">
                      <span className="font-medium" style={{ color: riskText(anomaly.deviationScore > 3 ? 90 : 70) }}>
                        {t('deviationValue', { value: anomaly.deviationScore.toFixed(1) })}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        anomaly.status === 'open' ? TONE.critical : anomaly.status === 'reviewed' ? TONE.info : TONE.low
                      }`}>
                        {statusLabel(anomaly.status)}
                      </span>
                    </td>
                    {canAct && (
                    <td className="py-3 px-4">
                      {anomaly.status === 'open' && (
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); updateAnomalyStatus(anomaly.id, 'reviewed') }}
                            className="px-2 py-1 text-xs bg-[var(--color-info)] text-white rounded"
                          >
                            {t('review')}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); updateAnomalyStatus(anomaly.id, 'dismissed') }}
                            className="px-2 py-1 text-xs border border-[var(--border-default)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-secondary)]"
                          >
                            {t('dismissBtn')}
                          </button>
                        </div>
                      )}
                    </td>
                    )}
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={canAct ? 7 : 6} className="px-4 py-3 bg-[var(--bg-secondary)]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(anomaly.excessEntitlements as any[])?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">{t('excessEntitlements')}</p>
                              <ul className="text-xs text-[var(--text-primary)] space-y-0.5">
                                {(anomaly.excessEntitlements as any[]).slice(0, 5).map((e: any, i: number) => (
                                  <li key={i}><bdi>{e.permissionName}</bdi> ({tierLabel(e.tier)}) — {t('peersHaveCount', { count: e.peersWithSame ?? 0 })}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {(anomaly.uniqueEntitlements as any[])?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">{t('uniqueEntitlements')}</p>
                              <ul className="text-xs text-[var(--text-primary)] space-y-0.5">
                                {(anomaly.uniqueEntitlements as any[]).slice(0, 5).map((e: any, i: number) => (
                                  <li key={i}><bdi>{e.permissionName}</bdi> ({tierLabel(e.tier)})</li>
                                ))}
                              </ul>
                            </div>
                          )}
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

        {anomalies.length === 0 && (
          <div className="p-8 text-center text-[var(--text-secondary)]">
            {t('noAnomalies')}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { useOverviewMetrics } from '@/lib/hooks/use-metrics'
import { StatTile } from '@/components/ui/stat-tile'
import { ErrorState } from '@/components/ui/error-state'
import { RiskGauge } from '@/components/ui/risk-gauge'
import { TierBadge } from '@/components/ui/tier-badge'
import { IdentityAvatar } from '@/components/ui/identity-avatar'
import { RiskTrendChart } from '@/components/charts/risk-trend'
import { IntegrationHealthStrip } from '@/components/dashboard/integration-health-strip'
import { StatTileSkeleton, ChartSkeleton } from '@/components/ui/skeleton'
import { TONE_TEXT, toneBadge } from '@/components/ui/tone'
import Link from 'next/link'
import { AlertTriangle, Sun, ChevronDown, ChevronUp } from 'lucide-react'
import { ExportPdfButton } from '@/components/dashboard/export-pdf-button'
import { useState } from 'react'

function TodaysBriefing() {
  const [expanded, setExpanded] = useState(false)
  const t = useTranslations('briefing')
  const { data } = useQuery<{
    narrative: string | null
    highlights: Array<{ type: string; text: string }> | null
    generatedAt: string | null
  } | null>({
    queryKey: ['briefing', 'latest'],
    queryFn: async () => {
      const res = await fetch('/api/briefings?latest=true')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    staleTime: 60_000,
  })

  const isToday = data?.generatedAt
    ? new Date(data.generatedAt).toDateString() === new Date().toDateString()
    : false

  const highlights = (data?.highlights || []) as Array<{ type: string; text: string }>
  const headline = data?.narrative?.split('\n')[0] || null

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sun size={16} style={{ color: 'var(--color-medium-text)' }} aria-hidden="true" />
          <h3 className="text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            {t('todaysBriefing')}
          </h3>
        </div>
        {headline && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className={`text-micro hover:underline flex items-center gap-1 ${TONE_TEXT.info}`}
          >
            {expanded ? t('collapse') : t('viewFull')}
            {expanded ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
          </button>
        )}
      </div>

      {!data || !isToday ? (
        <p className="text-caption text-[var(--text-secondary)]">{t('generatesAt7am')}</p>
      ) : (
        <>
          {headline && (
            <p className="text-body text-[var(--text-primary)] mb-2"><bdi>{headline}</bdi></p>
          )}
          <div className="flex flex-wrap gap-2 mb-2">
            {highlights.slice(0, expanded ? highlights.length : 4).map((h, i) => (
              <bdi
                key={i}
                className={`text-micro px-2 py-0.5 rounded-full ${toneBadge(h.type === 'positive' ? 'low' : h.type === 'negative' ? 'critical' : 'info')}`}
              >
                {h.text}
              </bdi>
            ))}
          </div>
          {expanded && data.narrative && (
            <div className="mt-3 p-3 rounded-md bg-[var(--bg-secondary)] text-caption text-[var(--text-secondary)] whitespace-pre-line" dir="auto">
              {data.narrative}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function DashboardOverview() {
  const { data, isLoading, error, refetch } = useOverviewMetrics()
  const t = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  const tSeverity = useTranslations('severity')

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <StatTileSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3"><ChartSkeleton height={260} /></div>
          <div className="lg:col-span-2"><ChartSkeleton height={260} /></div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]" style={{ boxShadow: 'var(--shadow-card)' }}>
          <ErrorState title={t('failedToLoad')} description={t('checkConnection')} onRetry={() => refetch()} />
        </div>
      </div>
    )
  }

  const riskSeries = (data.riskTrendData ?? []).map((d) => d.avgRiskScore)
  const riskNow = riskSeries.length ? riskSeries[riskSeries.length - 1] : 0
  const riskFirst = riskSeries[0] ?? riskNow
  const riskDelta = riskFirst ? Math.round(((riskNow - riskFirst) / riskFirst) * 100) : 0
  const riskSev: 'critical' | 'high' | 'medium' | 'low' =
    riskNow >= 80 ? 'critical' : riskNow >= 60 ? 'high' : riskNow >= 30 ? 'medium' : 'low'
  const criticalRisk = data.riskDistribution?.critical ?? 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5 tabular-nums">{t('identitiesMonitored', { count: data.totalIdentities })}</p>
        </div>
        <ExportPdfButton reportType="risk_summary" label={t('exportRiskSummary')} />
      </div>

      {/* Attention band — security posture at a glance, ordered by urgency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label={t('attackPaths')} value={data.attackPathsCount} severity={data.attackPathsCount > 0 ? 'critical' : 'low'} href="/dashboard/attack-paths" hint={t('hintAttackPaths')} />
        <StatTile label={t('activeViolations')} value={data.activeViolations} severity={data.activeViolations > 0 ? 'critical' : 'low'} href="/dashboard/violations" hint={t('hintOpenViolations')} />
        <StatTile label={t('adExposures')} value={data.exposuresCount} severity={data.exposuresCount > 0 ? 'high' : 'low'} href="/dashboard/exposures" hint={t('hintOpenFindings')} />
        <StatTile label={t('tierViolations')} value={data.tierViolations} severity={data.tierViolations > 0 ? 'high' : 'low'} href="/dashboard/tiering" hint={t('hintCrossTier')} />
        <StatTile label={t('criticalRisk')} value={criticalRisk} severity={criticalRisk > 0 ? 'critical' : 'low'} href="/dashboard/identities" hint={t('hintOfIdentities', { count: data.totalIdentities })} />
        <StatTile label={t('avgRisk30d')} value={riskNow} spark={riskSeries} delta={riskDelta} higherIsBetter={false} severity={riskSev} href="/dashboard/identities" hint={t('hintMeanRisk')} />
      </div>

      {/* Low Data Quality Banner */}
      {/* Today's Briefing */}
      <TodaysBriefing />


      {/* Risk Trend + Top 10 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Risk Posture Trend (3 cols) */}
        <div className="lg:col-span-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">{t('riskPosture')}</h3>
          <RiskTrendChart data={data.riskTrendData} />
        </div>

        {/* Top Riskiest (2 cols) */}
        <div className="lg:col-span-2 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('topRiskiest')}</h3>
            <Link href="/dashboard/identities?sortBy=riskScore&sortOrder=desc" className={`text-micro hover:underline ${TONE_TEXT.info}`}>
              {tCommon('viewAll')} <span className="inline-block rtl:-scale-x-100" aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="space-y-2">
            {data.topRiskyIdentities.map((identity: any, i: number) => {
              return (
                <Link
                  key={identity.id}
                  href={`/dashboard/identities/${identity.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-md hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <span className="text-caption font-mono text-[var(--text-secondary)] w-5 shrink-0">{i + 1}</span>
                  <IdentityAvatar
                    name={identity.displayName}
                    type={identity.type}
                    subType={identity.subType}
                    status={identity.status}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-caption font-medium text-[var(--text-primary)] truncate"><bdi>{identity.displayName}</bdi></p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <TierBadge tier={identity.adTier} effectiveTier={identity.tierViolation ? (identity.effectiveTier ?? 'tier_0') : null} size="xs" />
                    </div>
                  </div>
                  <RiskGauge score={identity.riskScore} size="sm" />
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tier Compliance + Pending Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Compliance gauge (2 cols) */}
        <div className="lg:col-span-2 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 flex flex-col items-center justify-center" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4 self-start">{t('tierCompliance')}</h3>
          <RiskGauge score={data.tierCompliancePercentage} size="lg" label={t('identitiesWithoutViolations')} higherIsBetter />

          {/* Risk distribution */}
          <div className="grid grid-cols-4 gap-2 w-full mt-6">
            {(['low', 'medium', 'high', 'critical'] as const).map((level) => {
              const colors = {
                low: { bg: 'var(--color-low-bg)', text: 'var(--color-low)' },
                medium: { bg: 'var(--color-medium-bg)', text: 'var(--color-medium)' },
                high: { bg: 'var(--color-high-bg)', text: 'var(--color-high)' },
                critical: { bg: 'var(--color-critical-bg)', text: 'var(--color-critical)' },
              }
              return (
                <div key={level} className="rounded-md p-2.5 text-center" style={{ backgroundColor: colors[level].bg }}>
                  <p className={`text-heading font-semibold ${TONE_TEXT[level]}`}>
                    {data.riskDistribution?.[level] ?? 0}
                  </p>
                  <p className="text-micro text-[var(--text-primary)]">{tSeverity(level)}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pending Actions (3 cols) */}
        <div className="lg:col-span-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">{t('pendingActions')}</h3>
          <div className="space-y-3">
            {data.pendingActions.map((action: any) => (
              <div
                key={action.type}
                className="flex items-center justify-between p-4 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ backgroundColor: action.count > 0 ? 'var(--color-high-bg)' : 'var(--color-low-bg)' }}>
                    <AlertTriangle size={16} style={{ color: action.count > 0 ? 'var(--color-high)' : 'var(--color-low)' }} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-body font-medium text-[var(--text-primary)]">{t.has(`pendingAction.${action.type}`) ? t(`pendingAction.${action.type}`) : action.label}</p>
                    <p className="text-micro text-[var(--text-secondary)]">{tCommon('requiresAttention')}</p>
                  </div>
                </div>
                <span className={`text-title font-semibold ${TONE_TEXT[action.count > 0 ? 'high' : 'low']}`}>
                  {action.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Integration Health */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h3 className="text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">{t('integrationHealth')}</h3>
        <IntegrationHealthStrip integrations={data.integrationHealth} />
      </div>
    </div>
  )
}

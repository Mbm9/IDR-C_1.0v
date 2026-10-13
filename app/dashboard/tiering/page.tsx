'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useTieringData } from '@/lib/hooks/use-tiering'
import { TierPyramid } from './tier-pyramid'
import { TierHeatmap } from '@/components/charts/tier-heatmap'
import { MetricCard } from '@/components/ui/metric-card'
import { useEnumLabel } from '@/components/ui/enum-label'
import { TONE_TEXT, toneBadge, riskTone, tierTone } from '@/components/ui/tone'

export default function TieringPage() {
  const { data, isLoading, error } = useTieringData()
  const t = useTranslations('tiering')
  const tIdentity = useTranslations('identity')
  const tTiers = useTranslations('tiers')
  const label = useEnumLabel()
  const tierLabel = (tier: string | null | undefined) => tTiers(tier && ['tier_0', 'tier_1', 'tier_2'].includes(tier) ? tier : 'unclassified')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map(i => (
            <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-64 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="bg-[var(--color-critical-bg)] border border-[var(--color-critical)] rounded-xl p-6">
          <p className={`font-medium ${TONE_TEXT.critical}`}>{t('failedToLoad')}</p>
        </div>
      </div>
    )
  }

  const violationCount = data.crossTierIdentities.length

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={t('tier0Identities')} value={data.tierCounts.tier_0 || 0} color="red" />
        <MetricCard label={t('tier1Identities')} value={data.tierCounts.tier_1 || 0} color="orange" />
        <MetricCard label={t('tier2Identities')} value={data.tierCounts.tier_2 || 0} color="blue" />
        <MetricCard label={t('tierViolations')} value={violationCount} color={violationCount > 0 ? 'red' : 'green'} />
      </div>

      {/* Pyramid + Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('tierDistribution')}</h3>
          <TierPyramid tierCounts={data.tierCounts} total={data.totalIdentities} />
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('tierAccessMatrix')}</h3>
          <TierHeatmap heatmap={data.heatmap} />
        </div>
      </div>

      {/* Cross-tier access paths */}
      {data.crossTierIdentities.length > 0 && (
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            {t('crossTierPathsCount', { count: data.crossTierIdentities.length })}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th scope="col" className="px-4 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('identityCol')}</th>
                  <th scope="col" className="px-4 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('typeCol')}</th>
                  <th scope="col" className="px-4 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('assignedTier')}</th>
                  <th scope="col" className="px-4 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('effectiveTier')}</th>
                  <th scope="col" className="px-4 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('riskScore')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {data.crossTierIdentities.map((identity) => {
                  return (
                    <tr key={identity.id} className="hover:bg-[var(--bg-secondary)]">
                      <td className="px-4 py-2">
                        <Link
                          href={`/dashboard/identities/${identity.id}`}
                          className={`font-medium hover:underline ${TONE_TEXT.info}`}
                        >
                          <bdi>{identity.displayName}</bdi>
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                        {identity.type === 'human' ? tIdentity('human') : tIdentity('non_human')}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge(tierTone(identity.adTier))}`}>
                          {tierLabel(identity.adTier)}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {identity.effectiveTier && (
                          <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge(tierTone(identity.effectiveTier))}`}>
                            {tierLabel(identity.effectiveTier)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`font-semibold ${TONE_TEXT[riskTone(identity.riskScore)]}`}>
                          {identity.riskScore}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tier 0 Inventory + Unclassified */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            {t('tier0Inventory')} ({t('identitiesCount', { count: data.tier0Identities.length })}{t('listSeparator')}{t('resourcesCount', { count: data.tier0Resources.length })})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.tier0Identities.map((i) => (
              <Link
                key={i.id}
                href={`/dashboard/identities/${i.id}`}
                className="flex items-center justify-between gap-2 p-2 rounded hover:bg-[var(--bg-secondary)] text-sm"
              >
                <span className="font-medium text-[var(--text-primary)] truncate">
                  <bdi>{i.displayName}</bdi>
                </span>
                <span className="text-xs text-[var(--text-secondary)] shrink-0">{label('subType', i.subType)}</span>
              </Link>
            ))}
            {data.tier0Resources.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                <span className="text-[var(--text-secondary)] truncate"><bdi>{r.name}</bdi></span>
                <span className="text-xs text-[var(--text-secondary)] shrink-0">{label('resourceType', r.type)}</span>
              </div>
            ))}
          </div>
        </div>

        {data.unclassifiedIdentities.length > 0 && (
          <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
              {t('unclassifiedCount', { count: data.unclassifiedIdentities.length })}
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.unclassifiedIdentities.map((i) => (
                <Link
                  key={i.id}
                  href={`/dashboard/identities/${i.id}`}
                  className="flex items-center justify-between gap-2 p-2 rounded hover:bg-[var(--bg-secondary)] text-sm"
                >
                  <span className="font-medium text-[var(--text-primary)] truncate">
                    <bdi>{i.displayName}</bdi>
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] shrink-0">{label('sourceSystem', i.sourceSystem)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

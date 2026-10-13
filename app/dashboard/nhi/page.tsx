'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { MetricCard } from '@/components/ui/metric-card'
import Link from 'next/link'

// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const tone = (c: string) => `bg-[var(--color-${c}-bg)] text-[color:color-mix(in_srgb,var(--color-${c})_60%,var(--text-primary))]`
const NEUTRAL = 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
const TIER_TONE: Record<string, string> = { tier_0: tone('critical'), tier_1: tone('high'), tier_2: tone('info') }
const STATUS_TONE: Record<string, string> = {
  active: tone('low'), disabled: tone('critical'), dormant: tone('medium'), orphaned: tone('high'), suspended: tone('high'),
}
const riskColor = (score: number) =>
  `color-mix(in srgb, var(--color-${score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low'}) 60%, var(--text-primary))`

export default function NHIPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['nhi'],
    queryFn: async () => {
      const res = await fetch('/api/nhi')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })
  const t = useTranslations('nhi')
  const tCommon = useTranslations('common')
  const tTiers = useTranslations('tiers')
  const tStatus = useTranslations('status')
  const tId = useTranslations('identity')
  const locale = useLocale()
  const formatDate = (d: string) => new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-28 animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={t('totalNhis')} value={data.nhis.length} color="blue" />
        <MetricCard label={t('orphaned')} value={data.ownership.orphaned || 0} color={data.ownership.orphaned > 0 ? 'red' : 'green'} />
        <MetricCard label={t('privileged')} value={data.privilegedCount} color="orange" />
        <MetricCard label={t('expiredButActive')} value={data.expiry.expired} color={data.expiry.expired > 0 ? 'red' : 'green'} />
      </div>

      {/* Ownership breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { key: 'owned', label: t('owned'), isGood: true },
          { key: 'orphaned', label: t('orphaned'), isGood: false },
          { key: 'owner_disabled', label: t('ownerDisabled'), isGood: false },
        ].map(status => (
          <div key={status.key} className={`p-4 rounded-xl border ${status.isGood ? 'bg-[var(--color-low-bg)] border-[var(--color-low)]' : 'bg-[var(--color-critical-bg)] border-[var(--color-critical)]'}`}>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{data.ownership[status.key] || 0}</p>
            <p className="text-sm text-[var(--text-secondary)]">{status.label}</p>
          </div>
        ))}
      </div>

      {/* NHI table */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] overflow-x-auto" style={{ boxShadow: 'var(--shadow-card)' }} tabIndex={0} role="region" aria-label={t('title')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-default)]">
              <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)]">{t('name')}</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)]">{t('subType')}</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)]">{t('tier')}</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)]">{t('risk')}</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)]">{t('statusCol')}</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)]">{t('expiry')}</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)]">{t('owner')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-default)]">
            {data.nhis.map((nhi: any) => {
              const tier = String(nhi.adTier ?? 'unclassified')
              const status = String(nhi.status ?? '')
              const subType = String(nhi.subType ?? '')
              return (
                <tr key={nhi.id} className="hover:bg-[var(--bg-secondary)]">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/identities/${nhi.id}`} className="font-medium text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline">
                      <bdi>{nhi.displayName}</bdi>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] text-xs">{tId.has(subType) ? tId(subType) : subType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${TIER_TONE[tier] ?? NEUTRAL}`}>
                      {tTiers.has(tier) ? tTiers(tier) : tier}
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className="font-semibold" style={{ color: riskColor(nhi.riskScore ?? 0) }}>{nhi.riskScore}</span></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_TONE[status] ?? NEUTRAL}`}>
                      {tStatus.has(status) ? tStatus(status) : status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {nhi.expiryAt ? formatDate(nhi.expiryAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {nhi.ownerIdentityId ? (
                      <span style={{ color: 'color-mix(in srgb, var(--color-low) 60%, var(--text-primary))' }}>{tCommon('assigned')}</span>
                    ) : (
                      <span className="font-medium" style={{ color: 'color-mix(in srgb, var(--color-critical) 70%, var(--text-primary))' }}>{tCommon('none')}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

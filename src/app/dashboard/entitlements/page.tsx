'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { MetricCard } from '@/components/ui/metric-card'
import { ErrorState } from '@/components/ui/error-state'
import { formatRelativeTime } from '@/lib/utils/formatters'
import { useEnumLabel } from '@/components/ui/enum-label'
import { ChartTooltip, axisProps, CHART } from '@/components/ui/chart-theme'
import { TONE_TEXT } from '@/components/ui/tone'
import Link from 'next/link'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

const CERT_COLORS: Record<string, string> = {
  certified: 'var(--color-low)',
  pending: 'var(--color-medium)',
  expired: 'var(--color-critical)',
  revoked: 'var(--text-secondary)',
}

export default function EntitlementsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['entitlements', 'dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/entitlements')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })
  const t = useTranslations('entitlements')
  const tCommon = useTranslations('common')
  const tCharts = useTranslations('charts')
  const locale = useLocale()
  const label = useEnumLabel()
  const rtl = locale === 'ar'

  if (error && !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <ErrorState onRetry={() => refetch()} />
        </div>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-28 animate-pulse" />)}
        </div>
      </div>
    )
  }

  const certData = Object.entries(data.certificationBreakdown).map(([status, count]) => ({
    name: label('certStatus', status),
    value: Number(count),
    color: CERT_COLORS[status] || 'var(--text-secondary)',
  }))

  const permData = Object.entries(data.permissionTypes).map(([type, count]) => ({
    type: label('permissionType', type),
    count: Number(count),
  }))

  const totalEntitlements = Object.values(data.certificationBreakdown).reduce((sum: number, c) => sum + Number(c), 0)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label={t('totalEntitlements')} value={totalEntitlements} color="blue" />
        <MetricCard label={t('unused90Days')} value={data.unusedEntitlements.length} color="orange" />
        <MetricCard label={t('riskTagged')} value={data.riskTaggedCount} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Certification breakdown pie */}
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('certificationStatus')}</h3>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-1/2" style={{ height: 220 }} role="img" aria-label={t('certificationChartLabel', { summary: certData.map((d) => `${d.name}: ${d.value}`).join(rtl ? '، ' : ', ') })}>
              <div className="h-full w-full" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={certData} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" dataKey="value" nameKey="name" stroke="var(--bg-primary)" rootTabIndex={-1}>
                    {certData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer></div>
            </div>
            {/* Legend as text so labels never collide with the ring on narrow screens. */}
            <ul className="w-full sm:w-1/2 space-y-2">
              {certData.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} aria-hidden="true" />
                    {d.name}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--text-primary)]">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Permission type distribution */}
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('permissionTypes')}</h3>
          <div dir="ltr" style={{ width: '100%', height: 240 }} role="img" aria-label={t('permissionChartLabel', { summary: permData.map((d) => `${d.type}: ${d.count}`).join(rtl ? '، ' : ', ') })}>
            <div className="h-full w-full" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={permData} layout="vertical" margin={{ top: 5, right: 12, left: 12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} reversed={rtl} {...axisProps} />
                <YAxis type="category" dataKey="type" orientation={rtl ? 'right' : 'left'} width={120} interval={0} {...axisProps} />
                <Tooltip cursor={{ fill: 'var(--bg-secondary)' }} content={<ChartTooltip format={(p: any) => ({ name: tCharts('count'), value: p.value })} />} />
                <Bar dataKey="count" fill={CHART.accent} radius={rtl ? [4, 0, 0, 4] : [0, 4, 4, 0]} barSize={18} name={tCharts('count')} />
              </BarChart>
            </ResponsiveContainer></div>
          </div>
        </div>
      </div>

      {/* Over-provisioned identities */}
      {data.overProvisionedIdentities.length > 0 && (
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            {t('overProvisionedCount', { count: data.overProvisionedIdentities.length })}
          </h3>
          <div className="space-y-2">
            {data.overProvisionedIdentities.map((i: any) => (
              <div key={i.identityId} className="flex items-center justify-between gap-3 p-3 bg-[var(--color-high-bg)] rounded-lg">
                <Link href={`/dashboard/identities/${i.identityId}`} className={`text-sm font-medium hover:underline truncate ${TONE_TEXT.info}`}>
                  <bdi>{i.identityName}</bdi>
                </Link>
                <span className={`text-sm font-bold shrink-0 ${TONE_TEXT.high}`}>{t('entitlementsCount', { count: i.entitlementCount })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unused entitlements */}
      {data.unusedEntitlements.length > 0 && (
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('unusedEntitlements')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('permission')}</th>
                  <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('identityCol')}</th>
                  <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('resource')}</th>
                  <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{t('lastUsed')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {data.unusedEntitlements.slice(0, 20).map((ent: any) => (
                  <tr key={ent.id}>
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]"><bdi>{ent.permissionName}</bdi></td>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/identities/${ent.identityId}`} className={`hover:underline text-xs ${TONE_TEXT.info}`}>
                        <bdi>{ent.identityName}</bdi>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)] text-xs"><bdi>{ent.resourceName}</bdi></td>
                    <td className="px-3 py-2 text-[var(--text-secondary)] text-xs whitespace-nowrap">{ent.lastUsedAt ? formatRelativeTime(ent.lastUsedAt, locale) : tCommon('never')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

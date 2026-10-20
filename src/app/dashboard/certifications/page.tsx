'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { MetricCard } from '@/components/ui/metric-card'

export default function CertificationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['entitlements', 'dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/entitlements')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })
  const t = useTranslations('certifications')
  const format = useFormatter()

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="animate-pulse bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-64" />
      </div>
    )
  }

  const cert = data.certificationBreakdown
  const total = Object.values(cert).reduce((sum: number, c) => sum + Number(c), 0)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label={t('certified')} value={cert.certified || 0} color="green" />
        <MetricCard label={t('pending')} value={cert.pending || 0} color="blue" />
        <MetricCard label={t('expired')} value={cert.expired || 0} color={cert.expired > 0 ? 'red' : 'green'} />
        <MetricCard label={t('revoked')} value={cert.revoked || 0} />
      </div>

      {/* Certification progress */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('certificationProgress')}</h3>
        <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-4 overflow-hidden" role="img" aria-label={t('progressLabel', { percent: format.number(total > 0 ? Number(cert.certified || 0) / total : 0, { style: 'percent' }) })}>
          {total > 0 && (
            <div className="h-full flex" aria-hidden="true">
              <div className="bg-green-500 h-full" style={{ width: `${(Number(cert.certified || 0) / total) * 100}%` }} />
              <div className="bg-yellow-500 h-full" style={{ width: `${(Number(cert.pending || 0) / total) * 100}%` }} />
              <div className="bg-red-500 h-full" style={{ width: `${(Number(cert.expired || 0) / total) * 100}%` }} />
              <div className="bg-slate-400 h-full" style={{ width: `${(Number(cert.revoked || 0) / total) * 100}%` }} />
            </div>
          )}
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-xs text-[var(--text-secondary)]">
          {([
            ['certified', 'bg-green-500'],
            ['pending', 'bg-yellow-500'],
            ['expired', 'bg-red-500'],
            ['revoked', 'bg-slate-400'],
          ] as const).map(([key, color]) => (
            <li key={key} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded ${color}`} aria-hidden="true" />
              {t('legendItem', { label: t(key), percent: format.number(total > 0 ? Number(cert[key] || 0) / total : 0, { style: 'percent' }) })}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">{t('certificationCampaigns')}</h3>
        <p className="text-sm text-[var(--text-secondary)]">{t('campaignNote')}</p>
      </div>
    </div>
  )
}

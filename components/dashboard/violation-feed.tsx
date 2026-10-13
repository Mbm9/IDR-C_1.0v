'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { formatRelativeTime } from '@/lib/utils/formatters'
import type { ViolationListItem } from '@/lib/hooks/use-violations'

interface ViolationFeedProps {
  violations: ViolationListItem[]
}

// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const tone = (c: string) => `bg-[var(--color-${c}-bg)] text-[color:color-mix(in_srgb,var(--color-${c})_60%,var(--text-primary))]`
const NEUTRAL = 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'

const STATUS_STYLES: Record<string, string> = {
  open: tone('critical'),
  acknowledged: tone('medium'),
  remediated: tone('low'),
  excepted: tone('info'),
  false_positive: NEUTRAL,
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: tone('critical'),
  high: tone('high'),
  medium: tone('medium'),
  low: NEUTRAL,
}

export function ViolationFeed({ violations }: ViolationFeedProps) {
  const t = useTranslations('violationFeed')
  const tEnum = useTranslations('securityEnums')
  const tSev = useTranslations('severity')
  const en = (ns: string, v: string) => (tEnum.has(`${ns}.${v}`) ? tEnum(`${ns}.${v}`) : v.replace(/_/g, ' '))

  if (violations.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-secondary)]">{t('empty')}</div>
    )
  }

  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('tableLabel')}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)]">
            <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)] uppercase">{t('type')}</th>
            <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)] uppercase">{t('severity')}</th>
            <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)] uppercase">{t('status')}</th>
            <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)] uppercase">{t('identity')}</th>
            <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)] uppercase">{t('policy')}</th>
            <th className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)] uppercase">{t('detected')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-default)]">
          {violations.map((v) => (
            <tr key={v.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
              <td className="px-4 py-3 text-[var(--text-primary)] text-xs">
                {en('violationTypes', v.violationType)}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${SEVERITY_STYLES[v.severity] ?? NEUTRAL}`}>
                  {tSev.has(v.severity) ? tSev(v.severity) : v.severity}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${STATUS_STYLES[v.status] || NEUTRAL}`}>
                  {en('statuses', v.status)}
                </span>
              </td>
              <td className="px-4 py-3">
                {v.identityId ? (
                  <Link
                    href={`/dashboard/identities/${v.identityId}`}
                    className="text-sm text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline"
                  >
                    <bdi>{v.identityName}</bdi>
                  </Link>
                ) : (
                  <span className="text-[var(--text-secondary)]">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-[var(--text-secondary)] text-xs"><bdi>{v.policyName}</bdi></td>
              <td className="px-4 py-3 text-[var(--text-secondary)] text-xs whitespace-nowrap">
                {formatRelativeTime(v.detectedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

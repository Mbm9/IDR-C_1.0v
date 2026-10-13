'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { formatDateTime, formatRelativeTime } from '@/lib/utils/formatters'
import { useEnumLabel } from '@/components/ui/enum-label'
import { TONE_TEXT, toneBadge, severityTone, statusTone } from '@/components/ui/tone'
import type { ViolationListItem } from '@/lib/hooks/use-violations'

// Localized violation list for the violations page (replaces the English-only
// components/dashboard/violation-feed on this route).

const thClass = 'px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)] uppercase whitespace-nowrap'

export function ViolationTable({ violations }: { violations: ViolationListItem[] }) {
  const t = useTranslations('violations')
  const tSeverity = useTranslations('severity')
  const locale = useLocale()
  const label = useEnumLabel()

  if (violations.length === 0) {
    return <div className="text-center py-12 text-[var(--text-secondary)]">{t('noViolations')}</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)]">
            <th scope="col" className={thClass}>{t('colType')}</th>
            <th scope="col" className={thClass}>{t('colSeverity')}</th>
            <th scope="col" className={thClass}>{t('colStatus')}</th>
            <th scope="col" className={thClass}>{t('colIdentity')}</th>
            <th scope="col" className={thClass}>{t('colPolicy')}</th>
            <th scope="col" className={thClass}>{t('colDetected')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-default)]">
          {violations.map((v) => (
            <tr key={v.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
              <td className="px-4 py-3 text-[var(--text-primary)] text-xs">{label('violationType', v.violationType)}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge(severityTone(v.severity))}`}>
                  {tSeverity.has(v.severity) ? tSeverity(v.severity) : v.severity}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge(statusTone(v.status))}`}>
                  {label('findingStatus', v.status)}
                </span>
              </td>
              <td className="px-4 py-3">
                {v.identityId ? (
                  <Link href={`/dashboard/identities/${v.identityId}`} className={`text-sm hover:underline ${TONE_TEXT.info}`}>
                    <bdi>{v.identityName}</bdi>
                  </Link>
                ) : (
                  <span className="text-[var(--text-secondary)]">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-[var(--text-secondary)] text-xs">{v.policyName}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)] text-xs whitespace-nowrap">
                <time dateTime={v.detectedAt} title={formatDateTime(v.detectedAt, locale)}>
                  {formatRelativeTime(v.detectedAt, locale)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

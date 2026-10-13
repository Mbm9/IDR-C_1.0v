'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MouseEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatRelativeTime } from '@/lib/utils/formatters'
import { useEnumLabel } from '@/components/ui/enum-label'
import { TONE_TEXT, toneBadge, riskTone, statusTone, tierTone } from '@/components/ui/tone'
import type { IdentityListItem } from '@/lib/hooks/use-identities'
import { AD_TIERS } from '@/lib/utils/tiers'

interface IdentityTableProps {
  data: IdentityListItem[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (column: string) => void
}

const COLUMNS = [
  { key: 'displayName', labelKey: 'colName', sortable: true },
  { key: 'type', labelKey: 'colType', sortable: true },
  { key: 'subType', labelKey: 'colSubType', sortable: true },
  { key: 'adTier', labelKey: 'colAdTier', sortable: true },
  { key: 'riskScore', labelKey: 'colRisk', sortable: true },
  { key: 'velocity', labelKey: 'colVelocity', sortable: true },
  { key: 'quality', labelKey: 'colQuality', sortable: false },
  { key: 'status', labelKey: 'colStatus', sortable: true },
  { key: 'sourceSystem', labelKey: 'colSource', sortable: true },
  { key: 'lastLogonAt', labelKey: 'colLastLogon', sortable: true },
] as const

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <span className="text-[var(--text-secondary)] opacity-60" aria-hidden="true">↕</span>
  return <span aria-hidden="true">{order === 'asc' ? '↑' : '↓'}</span>
}

/** Clicks on links, buttons and form controls keep their own behaviour. */
function isInteractiveTarget(e: MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement | null
  return !!target?.closest('a, button, input, select, textarea, label, [role="button"]')
}

export function IdentityTable({ data, sortBy, sortOrder, onSort }: IdentityTableProps) {
  const t = useTranslations('identityTable')
  const tTiers = useTranslations('tiers')
  const tStatus = useTranslations('status')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const label = useEnumLabel()
  const router = useRouter()

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-secondary)]">
        {t('noMatches')}
      </div>
    )
  }

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr className="border-b border-[var(--border-default)]">
            {COLUMNS.map((col) => {
              const active = col.key === sortBy
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="px-4 py-3 text-start text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap"
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)] select-none"
                    >
                      {t(col.labelKey)}
                      <SortIcon active={active} order={sortOrder} />
                    </button>
                  ) : (
                    t(col.labelKey)
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-default)]">
          {data.map((identity) => {
            const href = `/dashboard/identities/${identity.id}`
            const tierKey = (AD_TIERS as readonly string[]).includes(identity.adTier) ? identity.adTier : 'unclassified'
            const rf = (identity as IdentityListItem & { riskFactors?: { riskVelocity?: number } | null }).riskFactors
            const velocity = rf?.riskVelocity ?? 0
            const quality = identity.dataQuality?.score
            const statusLabel = tStatus.has(identity.status) ? tStatus(identity.status) : label('findingStatus', identity.status)

            return (
              <tr
                key={identity.id}
                onClick={(e) => {
                  if (isInteractiveTarget(e)) return
                  if (e.metaKey || e.ctrlKey) { window.open(href, '_blank'); return }
                  router.push(href)
                }}
                className="hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <Link
                    href={href}
                    className="font-medium text-[var(--text-primary)] hover:text-[var(--color-info-text)] transition-colors"
                  >
                    <bdi>{identity.displayName}</bdi>
                  </Link>
                  {identity.email && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5"><bdi>{identity.email}</bdi></p>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-base me-1" aria-hidden="true">{identity.type === 'human' ? '👤' : '🤖'}</span>
                  <span className="text-[var(--text-secondary)]">{label('identityType', identity.type)}</span>
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{label('subType', identity.subType)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${toneBadge(tierTone(tierKey))}`}>
                      {tTiers(tierKey)}
                    </span>
                    {identity.tierViolation && (
                      <span className={`text-xs font-bold ${TONE_TEXT.critical}`} title={t('tierViolation')}>
                        <span aria-hidden="true">!</span>
                        <span className="sr-only">{t('tierViolation')}</span>
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${TONE_TEXT[riskTone(identity.riskScore)]}`}>
                    {identity.riskScore}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {velocity > 0.5 ? (
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${TONE_TEXT.critical}`} title={t('perDay', { value: `+${velocity}` })}>
                      <span aria-hidden="true">↑</span> <bdi>{velocity.toFixed(2)}</bdi>
                      <span className="sr-only">{t('deteriorating')}</span>
                    </span>
                  ) : velocity < -0.5 ? (
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${TONE_TEXT.low}`} title={t('perDay', { value: String(velocity) })}>
                      <span aria-hidden="true">↓</span> <bdi>{velocity.toFixed(2)}</bdi>
                      <span className="sr-only">{t('improving')}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]" title={t('stable')}>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">{t('stable')}</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {quality == null ? (
                    <span className="inline-block w-full h-1.5 rounded-full bg-[var(--bg-tertiary)]" title={t('unscored')} aria-label={t('unscored')} />
                  ) : (
                    <div className="flex items-center gap-1.5" title={t('qualityScore', { score: quality })}>
                      <div className="w-16 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden" aria-hidden="true">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${quality}%`,
                            backgroundColor: quality > 80 ? 'var(--color-low)' : quality > 50 ? 'var(--color-medium)' : 'var(--color-critical)',
                          }}
                        />
                      </div>
                      <span className="text-xs text-[var(--text-secondary)]">{quality}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge(statusTone(identity.status))}`}>
                    {statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)] text-xs whitespace-nowrap">{label('sourceSystem', identity.sourceSystem)}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)] text-xs whitespace-nowrap">
                  {identity.lastLogonAt ? formatRelativeTime(identity.lastLogonAt, locale) : tCommon('never')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

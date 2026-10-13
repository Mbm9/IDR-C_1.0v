'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Link2, Lock, AlertTriangle, Route, Loader2, ChevronRight } from 'lucide-react'

// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const tone = (c: string) => `bg-[var(--color-${c}-bg)] text-[color:color-mix(in_srgb,var(--color-${c})_60%,var(--text-primary))]`
const NEUTRAL = 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'

const TIER_BADGE: Record<string, string> = {
  tier_0: `${tone('critical')} border-[var(--color-critical)]/30`,
  tier_top: 'bg-[color-mix(in_srgb,var(--color-tier-top)_12%,var(--bg-primary))] text-[color:color-mix(in_srgb,var(--color-tier-top)_60%,var(--text-primary))] border-[var(--color-tier-top)]/30',
  tier_1: `${tone('high')} border-[var(--color-high)]/30`,
  tier_2: `${NEUTRAL} border-[var(--border-default)]`,
  unclassified: `${NEUTRAL} border-[var(--border-default)]`,
}

const STATUS_BADGE: Record<string, string> = {
  enabled: tone('low'),
  disabled: NEUTRAL,
  enforced: tone('info'),
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: tone('critical'),
  high: tone('high'),
  medium: tone('medium'),
  low: NEUTRAL,
}

interface GpoDetail {
  gpo: any
  owner: any
  links: any[]
  permissions: any[]
  risks: Array<{ type: string; description: string; severity: string }>
  relatedPaths: any[]
}

export default function GpoDetailPage() {
  const params = useParams()
  const t = useTranslations('gpo')
  const tCommon = useTranslations('common')
  const tTiers = useTranslations('tiers')
  const tSev = useTranslations('severity')
  const tAp = useTranslations('attackPaths')
  const locale = useLocale()
  const tierLabel = (tier: string) => (tTiers.has(tier) ? tTiers(tier) : tier === 'unknown' ? t('unknownTier') : tier.replace('_', ' ').toUpperCase())
  const statusLabel = (s: string) => (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s)
  const sevLabel = (s: string) => (tSev.has(s) ? tSev(s) : s)
  const permLabel = (p: string) => (t.has(`permissionTypes.${p}`) ? t(`permissionTypes.${p}`) : p.replace(/_/g, ' '))
  const riskText = (r: { type: string; description: string }) => (t.has(`riskDetail.${r.type}`) ? t(`riskDetail.${r.type}`) : r.description)

  const [data, setData] = useState<GpoDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/gpo/${params?.id}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // error
    } finally {
      setLoading(false)
    }
  }, [params?.id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  if (loading) {
    return (
      <div role="status" aria-label={tCommon('loading')} className="flex items-center justify-center min-h-[60vh]">
        <Loader2 aria-hidden size={32} className="animate-spin text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))]" />
      </div>
    )
  }

  if (!data?.gpo) {
    return (
      <div className="text-center py-20 text-[var(--text-secondary)]">
        <p className="text-body">{tCommon('noData')}</p>
        <Link href="/dashboard/gpo" className="inline-block mt-4 text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline text-caption">
          {tCommon('back')}
        </Link>
      </div>
    )
  }

  const { gpo, owner, links, permissions, risks, relatedPaths } = data

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/dashboard/gpo"
        className="inline-flex items-center gap-2 text-caption text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft aria-hidden size={16} className="rtl:-scale-x-100" />
        {t('backToGpos')}
      </Link>

      {/* Header Card */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-h2 font-bold text-[var(--text-primary)] break-words"><bdi>{gpo.name}</bdi></h1>
              <span className={`text-micro px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${TIER_BADGE[gpo.adTier] || TIER_BADGE.unclassified}`}>
                {tierLabel(gpo.adTier)}
              </span>
              <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[gpo.status] || NEUTRAL}`}>
                {statusLabel(gpo.status)}
              </span>
            </div>
            {gpo.gpoGuid && (
              <p className="text-micro text-[var(--text-secondary)] font-mono break-all"><bdi>{gpo.gpoGuid}</bdi></p>
            )}
            {gpo.description && (
              <p className="text-caption text-[var(--text-secondary)]"><bdi>{gpo.description}</bdi></p>
            )}
          </div>
          <div className="text-end space-y-1">
            <p className="text-caption text-[var(--text-secondary)]">{t('fields.version')}: <span className="text-[var(--text-primary)] font-medium">{gpo.version}</span></p>
            {owner && (
              <p className="text-caption text-[var(--text-secondary)]">{t('fields.owner')}: <bdi className="text-[var(--text-primary)]">{owner.displayName}</bdi></p>
            )}
            {!owner && (
              <p className="text-caption font-medium text-[color:color-mix(in_srgb,var(--color-medium)_60%,var(--text-primary))]">{t('risks.noOwner')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Risks */}
      {risks.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-critical)]/30 bg-[var(--color-critical-bg)] p-4 space-y-3">
          <h2 className="text-body font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <AlertTriangle aria-hidden size={18} className="text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))]" />
            {t('risksCount', { count: risks.length })}
          </h2>
          <div className="space-y-2">
            {risks.map((risk, i) => (
              <div key={i} className="flex items-center gap-3 text-caption flex-wrap">
                <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[risk.severity] || NEUTRAL}`}>
                  {sevLabel(risk.severity)}
                </span>
                <span className="text-[var(--text-primary)]" title={risk.description}>{riskText(risk)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links Section */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="px-4 py-3 border-b border-[var(--border-default)] flex items-center gap-2">
          <Link2 aria-hidden size={16} className="text-[var(--text-secondary)]" />
          <h2 className="text-body font-semibold text-[var(--text-primary)]">{t('linksCount', { count: links.length })}</h2>
        </div>
        {links.length > 0 ? (
          <div tabIndex={0} role="region" aria-label={t('linksCount', { count: links.length })} className="overflow-x-auto">
            <table className="w-full text-caption">
              <thead>
                <tr className="bg-[var(--bg-secondary)]">
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('fields.linkedOu')}</th>
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('fields.tier')}</th>
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('fields.linkOrder')}</th>
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('fields.enforced')}</th>
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('fields.linkEnabled')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {links.map((link: any) => (
                  <tr key={link.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-micro text-[var(--text-primary)]"><bdi>{link.linkedOu}</bdi></td>
                    <td className="px-4 py-2.5">
                      <span className={`text-micro px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${TIER_BADGE[link.adTierOfOu] || TIER_BADGE.unclassified}`}>
                        {tierLabel(link.adTierOfOu)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{link.linkOrder}</td>
                    <td className="px-4 py-2.5">
                      {link.enforced ? (
                        <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${tone('info')}`}>{t('yes')}</span>
                      ) : (
                        <span className="text-micro text-[var(--text-secondary)]">{t('no')}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {link.linkEnabled ? (
                        <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${tone('low')}`}>{t('yes')}</span>
                      ) : (
                        <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${NEUTRAL}`}>{t('no')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-caption text-[var(--text-secondary)]">{t('risks.unlinked')}</p>
        )}
      </div>

      {/* Permissions Section */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="px-4 py-3 border-b border-[var(--border-default)] flex items-center gap-2">
          <Lock aria-hidden size={16} className="text-[var(--text-secondary)]" />
          <h2 className="text-body font-semibold text-[var(--text-primary)]">{t('permissions')} ({permissions.length})</h2>
        </div>
        {permissions.length > 0 ? (
          <div tabIndex={0} role="region" aria-label={t('permissions')} className="overflow-x-auto">
            <table className="w-full text-caption">
              <thead>
                <tr className="bg-[var(--bg-secondary)]">
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('trustee')}</th>
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('fields.permission')}</th>
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('fields.dangerous')}</th>
                  <th className="text-start px-4 py-2.5 font-medium text-[var(--text-secondary)]">{t('trusteeTier')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {permissions.map((perm: any) => {
                  const trusteeTier = perm.identityTier || perm.groupTier || 'unknown'
                  return (
                    <tr key={perm.id} className={`hover:bg-[var(--bg-secondary)] transition-colors ${perm.dangerous ? 'bg-[var(--color-critical-bg)]' : ''}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[var(--text-primary)]"><bdi>{perm.trusteeName}</bdi></p>
                        <p className="text-micro text-[var(--text-secondary)]">
                          <bdi>{perm.identityName || perm.groupName || ''}</bdi>
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{permLabel(perm.permissionType)}</td>
                      <td className="px-4 py-2.5">
                        {perm.dangerous ? (
                          <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${tone('critical')}`}>{t('yes')}</span>
                        ) : (
                          <span className="text-micro text-[var(--text-secondary)]">{t('no')}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-micro px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${TIER_BADGE[trusteeTier] || TIER_BADGE.unclassified}`}>
                          {tierLabel(trusteeTier)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-caption text-[var(--text-secondary)]">{tCommon('noData')}</p>
        )}
      </div>

      {/* Related Attack Paths */}
      {relatedPaths.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="px-4 py-3 border-b border-[var(--border-default)] flex items-center gap-2">
            <Route aria-hidden size={16} className="text-[var(--text-secondary)]" />
            <h2 className="text-body font-semibold text-[var(--text-primary)]">{t('relatedPathsCount', { count: relatedPaths.length })}</h2>
          </div>
          <div className="divide-y divide-[var(--border-default)]">
            {relatedPaths.map((path: any) => (
              <Link
                key={path.id}
                href={`/dashboard/attack-paths/${path.id}`}
                className="px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <div>
                  <p className="text-caption font-medium text-[var(--text-primary)]"><bdi>{path.attackTechnique}</bdi></p>
                  <p className="text-micro text-[var(--text-secondary)]">{t('riskValue', { score: path.riskScore })} | {tAp('hopsCount', { count: path.pathLength })}</p>
                </div>
                <ChevronRight aria-hidden size={14} className="text-[var(--text-secondary)] rtl:-scale-x-100" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Timeline placeholder */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-6 text-center text-[var(--text-secondary)]">
        <p className="text-caption">{t('historyPlaceholder')}</p>
        {gpo.modifiedInSourceAt && (
          <p className="text-micro mt-2">{t('lastModifiedInSource', { date: new Date(gpo.modifiedInSourceAt).toLocaleString(locale) })}</p>
        )}
        {gpo.createdInSourceAt && (
          <p className="text-micro">{t('createdInSource', { date: new Date(gpo.createdInSourceAt).toLocaleString(locale) })}</p>
        )}
      </div>
    </div>
  )
}

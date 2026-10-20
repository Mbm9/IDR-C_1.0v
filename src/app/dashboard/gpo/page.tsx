'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { MetricCard } from '@/components/ui/metric-card'
import { GpoLinksTree } from '@/components/dashboard/gpo-links-tree'
import { Shield, AlertTriangle, Search, Loader2, ArrowRight } from 'lucide-react'
import { useAppRole } from '@/lib/hooks/use-app-role'
import { isControlPlaneTier, isStricterTier } from '@/lib/utils/tiers'

interface GpoItem {
  id: string
  name: string
  displayName: string | null
  gpoGuid: string | null
  status: string
  adTier: string
  version: number
  description: string | null
  ownerIdentityId: string | null
  ownerName: string | null
  linkCount: number
  permissionCount: number
  createdAt: string
  modifiedInSourceAt: string | null
}

interface GpoStats {
  total: number
  byTier: Record<string, number>
  dangerousCount: number
  enforcedCount: number
  unlinkedCount: number
  noOwnerCount: number
  nonAdminModifiable: number
}

interface GpoRisk {
  gpoId: string
  gpoName: string
  gpoTier: string
  riskType: string
  description: string
  severity: string
  affectedIdentity?: string
  affectedIdentityTier?: string
}

interface GpoPermission {
  id: string
  gpoId: string
  trusteeName: string
  permissionType: string
  dangerous: boolean
  adTierOfGpo: string
  trusteeIdentityId: string | null
  trusteeGroupId: string | null
  identityName?: string
  identityTier?: string
  groupName?: string
  groupTier?: string
  gpoName?: string
}

type Tab = 'all' | 'risky' | 'links' | 'permissions'

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

export default function GpoPage() {
  const t = useTranslations('gpo')
  const tCommon = useTranslations('common')
  const tTiers = useTranslations('tiers')
  const tSev = useTranslations('severity')
  const tGate = useTranslations('roleGate')
  const { can } = useAppRole()
  // POST /api/gpo/scan requires analyst
  const canScan = can('analyst')
  const tierLabel = (tier: string) => (tTiers.has(tier) ? tTiers(tier) : tier === 'unknown' ? t('unknownTier') : tier.replace('_', ' ').toUpperCase())
  const statusLabel = (s: string) => (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s)
  const sevLabel = (s: string) => (tSev.has(s) ? tSev(s) : s)
  const permLabel = (p: string) => (t.has(`permissionTypes.${p}`) ? t(`permissionTypes.${p}`) : p.replace(/_/g, ' '))
  const riskLabel = (r: GpoRisk) => (t.has(`riskTypes.${r.riskType}`) ? t(`riskTypes.${r.riskType}`) : r.description)

  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [gpos, setGpos] = useState<GpoItem[]>([])
  const [stats, setStats] = useState<GpoStats | null>(null)
  const [risks, setRisks] = useState<GpoRisk[]>([])
  const [linksData, setLinksData] = useState<any[]>([])
  const [permissions, setPermissions] = useState<GpoPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (tierFilter) params.set('tier', tierFilter)
      if (statusFilter) params.set('status', statusFilter)

      const [gpoRes, statsRes, risksRes] = await Promise.all([
        fetch(`/api/gpo?${params}`),
        fetch('/api/gpo/stats'),
        fetch('/api/gpo/risks'),
      ])

      if (gpoRes.ok) {
        const data = await gpoRes.json()
        setGpos(data.gpos)
      }
      if (statsRes.ok) {
        setStats(await statsRes.json())
      }
      if (risksRes.ok) {
        const data = await risksRes.json()
        setRisks(data.risks)
      }
    } catch {
      // error
    } finally {
      setLoading(false)
    }
  }, [search, tierFilter, statusFilter])

  // Fetch links map data when that tab is active
  const fetchLinksData = useCallback(async () => {
    try {
      // Get all GPOs with their links for the tree
      const res = await fetch('/api/gpo?limit=200')
      if (!res.ok) return
      const data = await res.json()
      const allLinks: any[] = []

      // For each GPO, get its links
      for (const gpo of data.gpos) {
        if (gpo.linkCount > 0) {
          const detailRes = await fetch(`/api/gpo/${gpo.id}`)
          if (detailRes.ok) {
            const detail = await detailRes.json()
            for (const link of detail.links) {
              allLinks.push({
                ...link,
                gpoName: gpo.name,
                gpoTier: gpo.adTier,
              })
            }
          }
        }
      }
      setLinksData(allLinks)
    } catch {
      // error
    }
  }, [])

  // Fetch permissions data
  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/gpo?limit=200')
      if (!res.ok) return
      const data = await res.json()
      const allPerms: GpoPermission[] = []

      for (const gpo of data.gpos) {
        if (gpo.permissionCount > 0) {
          const detailRes = await fetch(`/api/gpo/${gpo.id}`)
          if (detailRes.ok) {
            const detail = await detailRes.json()
            for (const perm of detail.permissions) {
              allPerms.push({
                ...perm,
                gpoName: gpo.name,
              })
            }
          }
        }
      }
      setPermissions(allPerms)
    } catch {
      // error
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (activeTab === 'links') fetchLinksData()
    if (activeTab === 'permissions') fetchPermissions()
  }, [activeTab, fetchLinksData, fetchPermissions])

  const runScan = useCallback(async () => {
    setScanning(true)
    try {
      await fetch('/api/gpo/scan', { method: 'POST' })
      await fetchData()
    } finally {
      setScanning(false)
    }
  }, [fetchData])

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'all', label: t('allGpos') },
    { key: 'risky', label: t('riskyGpos') },
    { key: 'links', label: t('linksMap') },
    { key: 'permissions', label: t('permissions') },
  ]

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-h2 font-bold text-[var(--text-primary)]">{t('title')}</h1>
          <p className="text-caption text-[var(--text-secondary)]">{t('description')}</p>
        </div>
        <button
          onClick={canScan ? runScan : undefined}
          disabled={scanning}
          aria-disabled={!canScan || undefined}
          title={canScan ? undefined : tGate('requiresRole', { role: tGate('roles.analyst') })}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-card)] bg-[var(--color-info)] text-white text-caption font-medium hover:opacity-90 disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed transition"
        >
          {scanning ? <Loader2 aria-hidden size={16} className="animate-spin" /> : <Shield aria-hidden size={16} />}
          {scanning ? tCommon('loading') : t('scan')}
        </button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-3">
          <MetricCard label={t('stats.total')} value={stats.total} />
          <MetricCard label={t('stats.tier0')} value={stats.byTier.tier_0 || 0} color="red" />
          <MetricCard label={t('stats.tierTop')} value={stats.byTier.tier_top ?? 0} color="rose" />
          <MetricCard label={t('stats.tier1')} value={stats.byTier.tier_1 || 0} color="orange" />
          <MetricCard label={t('stats.tier2')} value={stats.byTier.tier_2 || 0} />
          <MetricCard label={t('stats.risky')} value={stats.dangerousCount} color="red" />
          <MetricCard label={t('stats.enforced')} value={stats.enforcedCount} color="blue" />
          <MetricCard label={t('stats.unlinked')} value={stats.unlinkedCount} color="orange" />
          <MetricCard label={t('stats.noOwner')} value={stats.noOwnerCount} color="orange" />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[var(--border-default)] overflow-x-auto">
        <div role="tablist" aria-label={t('title')} className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-caption font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'border-[var(--color-info)] text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search aria-hidden size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                type="text"
                aria-label={t('searchGpos')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tCommon('search')}
                className="w-full ps-9 pe-3 py-2 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-caption text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
              />
            </div>
            <select
              aria-label={t('tierFilter')}
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="px-3 py-2 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-caption text-[var(--text-primary)]"
            >
              <option value="">{tTiers('allTiers')}</option>
              <option value="tier_0">{tTiers('tier_0')}</option>
              <option value="tier_top">{tTiers('tier_top')}</option>
              <option value="tier_1">{tTiers('tier_1')}</option>
              <option value="tier_2">{tTiers('tier_2')}</option>
            </select>
            <select
              aria-label={t('statusFilter')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-caption text-[var(--text-primary)]"
            >
              <option value="">{t('allStatuses')}</option>
              <option value="enabled">{t('statuses.enabled')}</option>
              <option value="disabled">{t('statuses.disabled')}</option>
              <option value="enforced">{t('statuses.enforced')}</option>
            </select>
          </div>

          {/* GPO Table */}
          <div tabIndex={0} role="region" aria-label={t('allGpos')} className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-default)]">
            <table className="w-full text-caption">
              <thead>
                <tr className="bg-[var(--bg-secondary)]">
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.name')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.guid')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.tier')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.status')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.links')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('permissions')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.owner')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {gpos.map((gpo) => (
                  <tr
                    key={gpo.id}
                    className="hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/gpo/${gpo.id}`} className="font-medium text-[var(--text-primary)] hover:text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline">
                        <bdi>{gpo.name}</bdi>
                      </Link>
                      {gpo.description && (
                        <p className="text-micro text-[var(--text-secondary)] truncate max-w-[250px]"><bdi>{gpo.description}</bdi></p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-micro"><bdi>{gpo.gpoGuid || '-'}</bdi></td>
                    <td className="px-4 py-3">
                      <span className={`text-micro px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${TIER_BADGE[gpo.adTier] || TIER_BADGE.unclassified}`}>
                        {tierLabel(gpo.adTier)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[gpo.status] || NEUTRAL}`}>
                        {statusLabel(gpo.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{gpo.linkCount}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{gpo.permissionCount}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{gpo.ownerName ? <bdi>{gpo.ownerName}</bdi> : <span className="text-[var(--text-secondary)] italic">{tCommon('none')}</span>}</td>
                  </tr>
                ))}
                {gpos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[var(--text-secondary)]">
                      {tCommon('noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'risky' && (
        <div className="space-y-4">
          {risks.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">
              <AlertTriangle aria-hidden size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-body">{tCommon('noData')}</p>
            </div>
          ) : (
            <div tabIndex={0} role="region" aria-label={t('riskyGpos')} className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-default)]">
              <table className="w-full text-caption">
                <thead>
                  <tr className="bg-[var(--bg-secondary)]">
                    <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.name')}</th>
                    <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.tier')}</th>
                    <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('riskReason')}</th>
                    <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('affected')}</th>
                    <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('severityCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {risks.map((risk, i) => (
                    <tr
                      key={`${risk.gpoId}-${i}`}
                      className="hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/dashboard/gpo/${risk.gpoId}`} className="text-[var(--text-primary)] hover:text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline"><bdi>{risk.gpoName}</bdi></Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-micro px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${TIER_BADGE[risk.gpoTier] || TIER_BADGE.unclassified}`}>
                          {tierLabel(risk.gpoTier)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] max-w-[400px] truncate" title={risk.description}>{riskLabel(risk)}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{risk.affectedIdentity ? <bdi>{risk.affectedIdentity}</bdi> : '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[risk.severity] || NEUTRAL}`}>
                          {sevLabel(risk.severity)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'links' && (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
          <GpoLinksTree links={linksData} />
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <div tabIndex={0} role="region" aria-label={t('permissions')} className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-default)]">
            <table className="w-full text-caption">
              <thead>
                <tr className="bg-[var(--bg-secondary)]">
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('trusteeCol')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('gpoCol')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.permission')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.dangerous')}</th>
                  <th className="text-start px-4 py-3 font-medium text-[var(--text-secondary)]">{t('fields.tierGap')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {permissions.map((perm) => {
                  const trusteeTier = perm.identityTier || perm.groupTier || 'unknown'
                  const gpoTier = perm.adTierOfGpo
                  const hasTierGap = isControlPlaneTier(gpoTier) && trusteeTier !== 'unknown' && isStricterTier(gpoTier, trusteeTier)
                  return (
                    <tr key={perm.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text-primary)]"><bdi>{perm.trusteeName}</bdi></p>
                        <p className="text-micro text-[var(--text-secondary)]">{tierLabel(trusteeTier)}</p>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{perm.gpoName ? <bdi>{perm.gpoName}</bdi> : '-'}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{permLabel(perm.permissionType)}</td>
                      <td className="px-4 py-3">
                        {perm.dangerous ? (
                          <span className={`text-micro px-2 py-0.5 rounded-full font-medium ${tone('critical')}`}>{t('yes')}</span>
                        ) : (
                          <span className="text-micro text-[var(--text-secondary)]">{t('no')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {hasTierGap ? (
                          <span className={`text-micro px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 whitespace-nowrap ${tone('critical')}`}>
                            {tierLabel(trusteeTier)} <ArrowRight aria-hidden size={10} className="rtl:-scale-x-100" /> {tierLabel(gpoTier)}
                          </span>
                        ) : (
                          <span className="text-micro text-[var(--text-secondary)]">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {permissions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-[var(--text-secondary)]">
                      {tCommon('noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Route, AlertTriangle, Shield, Zap, ArrowRight, RefreshCw, Search,
  LayoutGrid, TableIcon, ChevronRight, ChevronDown,
} from 'lucide-react'
import { AttackPathGraph } from '@/components/dashboard/attack-path-graph'
import { AttackPathChain } from '@/components/dashboard/attack-path-chain'
import type { AttackPathData } from '@/components/dashboard/attack-path-graph'
import { useAppRole } from '@/lib/hooks/use-app-role'
import { isControlPlaneTier } from '@/lib/utils/tiers'

interface AttackPath {
  id: string
  sourceIdentityId: string
  targetIdentityId: string | null
  targetResourceId: string | null
  pathNodes: Array<{ id: string; type: string; name: string; tier?: string; riskScore?: number; subType?: string }>
  pathEdges: Array<{ source: string; target: string; type: string; label: string; technique: string; mitreId?: string; exploitability?: string; confirmed?: boolean }>
  pathLength: number
  riskScore: number
  attackTechnique: string
  mitreId: string | null
  aiNarrative: string | null
  status: string
  discoveredAt: string
}

interface Stats {
  totalPaths: number
  criticalCount: number
  highCount: number
  avgLength: number
  shortestPath: number
  shortestToDA: number
  maxRiskScore: number
  identitiesWithT0Paths: number
}

type ViewMode = 'table' | 'graph'
type SortMode = 'risk' | 'length'

const PAGE_SIZE = 50

// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const TONE = {
  critical: 'bg-[var(--color-critical-bg)] text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]',
  high: 'bg-[var(--color-high-bg)] text-[color:color-mix(in_srgb,var(--color-high)_60%,var(--text-primary))]',
  medium: 'bg-[var(--color-medium-bg)] text-[color:color-mix(in_srgb,var(--color-medium)_60%,var(--text-primary))]',
  low: 'bg-[var(--color-low-bg)] text-[color:color-mix(in_srgb,var(--color-low)_60%,var(--text-primary))]',
  info: 'bg-[var(--color-info-bg)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))]',
  neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
} as const

function riskBadgeColor(score: number): string {
  if (score >= 80) return TONE.critical
  if (score >= 60) return TONE.high
  if (score >= 40) return TONE.medium
  return TONE.low
}

function statusBadge(status: string): string {
  switch (status) {
    case 'open': return TONE.critical
    case 'acknowledged': return TONE.medium
    case 'remediated': return TONE.low
    default: return TONE.neutral
  }
}

export default function AttackPathsPage() {
  const t = useTranslations('attackPaths')
  const tCommon = useTranslations('common')
  const tTiers = useTranslations('tiers')
  const tGate = useTranslations('roleGate')
  const { can } = useAppRole()
  // POST /api/attack-paths requires analyst
  const canScan = can('analyst')
  const statusLabel = (s: string) => (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s.replace(/_/g, ' '))
  const tierLabel = (tier: string) => (tTiers.has(tier) ? tTiers(tier) : tier.replace('_', ' ').toUpperCase())
  const [paths, setPaths] = useState<AttackPath[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTechnique, setFilterTechnique] = useState('')
  const [filterMinRisk, setFilterMinRisk] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [highlightPathId, setHighlightPathId] = useState<string | undefined>(undefined)
  const [selectedPathFilter, setSelectedPathFilter] = useState<string>('all')
  const [sortMode, setSortMode] = useState<SortMode>('risk')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // Expanded rows belong to the rows on screen; drop them when the page or set changes.
  useEffect(() => { setExpanded(new Set()) }, [page, filterTechnique, filterMinRisk, sortMode])
  const toggleExpanded = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filterMinRisk > 0) params.set('minRiskScore', String(filterMinRisk))
      if (filterTechnique) params.set('technique', filterTechnique)
      params.set('sort', sortMode)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String((page - 1) * PAGE_SIZE))

      const [pathsRes, statsRes] = await Promise.all([
        fetch(`/api/attack-paths?${params}`),
        fetch('/api/attack-paths/stats'),
      ])
      if (pathsRes.ok) {
        const data = await pathsRes.json()
        setPaths(data.paths || [])
        setTotal(data.total || 0)
      }
      if (statsRes.ok) {
        setStats(await statsRes.json())
      }
    } catch (err) {
      setError(t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [filterTechnique, filterMinRisk, sortMode, page])

  useEffect(() => { fetchData() }, [fetchData])

  const triggerScan = async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/attack-paths', { method: 'POST' })
      if (res.ok) {
        await fetchData()
      } else {
        setError(t('scanFailed'))
      }
    } catch {
      setError(t('scanFailed'))
    } finally {
      setScanning(false)
    }
  }

  // Convert paths to graph data format
  const graphPaths: AttackPathData[] = paths
    .filter(p => selectedPathFilter === 'all' || p.id === selectedPathFilter)
    .map(p => ({
      id: p.id,
      pathNodes: (p.pathNodes as any[]).map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        tier: n.tier,
        riskScore: n.riskScore,
        subType: n.subType,
      })),
      pathEdges: (p.pathEdges as any[]).map(e => ({
        source: e.source,
        target: e.target,
        technique: e.technique,
        label: e.label,
        mitreId: e.mitreId,
        type: e.type,
        exploitability: e.exploitability,
        confirmed: e.confirmed,
      })),
      riskScore: p.riskScore,
    }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-h2 font-bold text-[var(--text-primary)]">{t('title')}</h1>
          <p className="text-body text-[var(--text-secondary)] mt-1">{t('description')}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div role="group" aria-label={t('viewMode')} className="flex items-center rounded-[var(--radius-badge)] border border-[var(--border-default)] overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              className={`flex items-center gap-1.5 px-3 py-2 text-micro font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-[var(--color-info)] text-white'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              <TableIcon size={14} aria-hidden />
              {t('viewTable')}
            </button>
            <button
              onClick={() => setViewMode('graph')}
              aria-pressed={viewMode === 'graph'}
              className={`flex items-center gap-1.5 px-3 py-2 text-micro font-medium transition-colors ${
                viewMode === 'graph'
                  ? 'bg-[var(--color-info)] text-white'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              <LayoutGrid size={14} aria-hidden />
              {t('viewGraph')}
            </button>
          </div>

          <button
            onClick={canScan ? triggerScan : undefined}
            disabled={scanning}
            aria-disabled={!canScan || undefined}
            title={canScan ? undefined : tGate('requiresRole', { role: tGate('roles.analyst') })}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-info)] text-white rounded-[var(--radius-badge)] hover:opacity-90 transition-opacity disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} aria-hidden className={scanning ? 'animate-spin' : ''} />
            {scanning ? t('scanning') : t('runScan')}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={Route} label={t('totalPaths')} value={stats.totalPaths} />
          <StatCard icon={AlertTriangle} label={t('criticalPaths')} value={stats.criticalCount} color="text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))]" />
          <StatCard icon={Zap} label={t('avgLength')} value={stats.avgLength} suffix={t('hopsUnit', { count: stats.avgLength })} />
          <StatCard icon={Shield} label={t('shortestToDA')} value={stats.shortestToDA} suffix={t('hopsUnit', { count: stats.shortestToDA })} />
          <StatCard icon={Route} label={t('identitiesWithT0')} value={stats.identitiesWithT0Paths} />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} aria-hidden className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="text"
            aria-label={t('filterByTechnique')}
            placeholder={t('filterByTechnique')}
            value={filterTechnique}
            onChange={e => { setFilterTechnique(e.target.value); setPage(1) }}
            className="w-full ps-9 pe-3 py-2 rounded-[var(--radius-badge)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-body"
          />
        </div>
        <select
          aria-label={t('riskFilter')}
          value={filterMinRisk}
          onChange={e => { setFilterMinRisk(Number(e.target.value)); setPage(1) }}
          className="px-3 py-2 rounded-[var(--radius-badge)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-body"
        >
          <option value={0}>{t('allRiskLevels')}</option>
          <option value={80}>{t('criticalOnly')}</option>
          <option value={60}>{t('highAndAbove')}</option>
          <option value={40}>{t('mediumAndAbove')}</option>
        </select>
        <select
          aria-label={t('sortLabel')}
          value={sortMode}
          onChange={e => { setSortMode(e.target.value as SortMode); setPage(1) }}
          className="px-3 py-2 rounded-[var(--radius-badge)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-body"
        >
          <option value="risk">{t('sortHighestRisk')}</option>
          <option value="length">{t('sortLongestPath')}</option>
        </select>

        {/* Path selector for graph view */}
        {viewMode === 'graph' && paths.length > 0 && (
          <select
            aria-label={t('pathSelector')}
            value={selectedPathFilter}
            onChange={e => {
              setSelectedPathFilter(e.target.value)
              setHighlightPathId(e.target.value === 'all' ? undefined : e.target.value)
            }}
            className="px-3 py-2 rounded-[var(--radius-badge)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-body max-w-xs"
          >
            <option value="all">{t('allPaths', { count: paths.length })}</option>
            {paths.slice(0, 30).map(p => {
              const source = (p.pathNodes as any[])?.[0]?.name || t('unknown')
              const target = (p.pathNodes as any[])?.[(p.pathNodes as any[]).length - 1]?.name || t('unknown')
              return (
                <option key={p.id} value={p.id}>
                  {t('pathOption', { source, target, risk: p.riskScore })}
                </option>
              )
            })}
          </select>
        )}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="p-4 rounded-[var(--radius-card)] bg-[var(--color-critical-bg)] text-[var(--text-primary)] border border-[var(--color-critical)]/40">
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16 text-[var(--text-secondary)]">{tCommon('loading')}</div>
      ) : paths.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-[var(--text-secondary)]">
          <Route size={48} aria-hidden className="mb-3 opacity-30" />
          <p className="text-body font-medium">{t('noPaths')}</p>
          <p className="text-caption mt-1">{t('noPathsDescription')}</p>
        </div>
      ) : viewMode === 'graph' ? (
        /* ── Graph View ── */
        <div className="space-y-4">
          <AttackPathGraph
            paths={graphPaths}
            highlightPathId={highlightPathId}
          />

          {/* Clickable path list below graph */}
          <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
            <div className="px-4 py-3 border-b border-[var(--border-default)]">
              <p className="text-micro font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                {t('clickToHighlight')}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border-default)]" tabIndex={0} role="region" aria-label={t('pathList')}>
              {paths.slice(0, 30).map(path => {
                const sourceNode = (path.pathNodes as any[])?.[0]
                const targetNode = (path.pathNodes as any[])?.[(path.pathNodes as any[]).length - 1]
                const isHighlighted = highlightPathId === path.id
                const toggle = () => {
                  if (highlightPathId === path.id) {
                    setHighlightPathId(undefined)
                    setSelectedPathFilter('all')
                  } else {
                    setHighlightPathId(path.id)
                    setSelectedPathFilter(path.id)
                  }
                }
                return (
                  <div
                    key={path.id}
                    className={`flex items-center gap-3 px-4 py-2 transition-colors ${
                      isHighlighted ? 'bg-[var(--color-info)]/10' : 'hover:bg-[var(--bg-secondary)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={toggle}
                      aria-pressed={isHighlighted}
                      className="flex-1 min-w-0 flex items-center gap-3 text-start"
                    >
                      <span className={`inline-block px-2 py-0.5 rounded-full text-micro font-semibold ${riskBadgeColor(path.riskScore)}`}>
                        {path.riskScore}
                      </span>
                      <bdi className="text-body text-[var(--text-primary)] font-medium truncate">
                        {sourceNode?.name || t('unknown')}
                      </bdi>
                      <ArrowRight size={12} aria-hidden className="text-[var(--text-secondary)] flex-shrink-0 rtl:-scale-x-100" />
                      <bdi className="text-body text-[var(--text-primary)] truncate">
                        {targetNode?.name || t('unknown')}
                      </bdi>
                      <span className="text-micro text-[var(--text-secondary)] ms-auto flex-shrink-0">
                        {t('hopsCount', { count: path.pathLength })} | <bdi>{path.attackTechnique}</bdi>
                      </span>
                    </button>
                    <Link
                      href={`/dashboard/attack-paths/${path.id}`}
                      className="text-micro text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline flex-shrink-0"
                    >
                      {t('details')}
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ── Table View ── */
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] overflow-hidden">
          <div tabIndex={0} role="region" aria-label={t('title')} className="overflow-x-auto @container">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-micro uppercase tracking-wider">
                  <th className="w-10 ps-3 pe-0 py-3"><span className="sr-only">{t('chain.expandColumn')}</span></th>
                  <th className="px-4 py-3 text-start">{t('source')}</th>
                  <th className="px-4 py-3 text-start">{t('target')}</th>
                  <th className="px-4 py-3 text-center">{t('length')}</th>
                  <th className="px-4 py-3 text-center">{t('riskScore')}</th>
                  <th className="px-4 py-3 text-start">{t('technique')}</th>
                  <th className="px-4 py-3 text-start">{t('mitreId')}</th>
                  <th className="px-4 py-3 text-center">{t('statusCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {paths.map(path => {
                  const sourceNode = (path.pathNodes as any[])?.[0]
                  const targetNode = (path.pathNodes as any[])?.[(path.pathNodes as any[]).length - 1]
                  const isOpen = expanded.has(path.id)
                  const sourceName = sourceNode?.name || t('unknown')
                  return (
                    <Fragment key={path.id}>
                    <tr className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="ps-3 pe-0 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(path.id)}
                          aria-expanded={isOpen}
                          aria-controls={`chain-${path.id}`}
                          aria-label={isOpen ? t('chain.collapseRow', { source: sourceName }) : t('chain.expandRow', { source: sourceName })}
                          className="flex items-center justify-center w-7 h-7 rounded-[var(--radius-button)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]"
                        >
                          {isOpen
                            ? <ChevronDown size={16} aria-hidden />
                            : <ChevronRight size={16} aria-hidden className="rtl:-scale-x-100" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/attack-paths/${path.id}`} className="text-body font-medium text-[var(--text-primary)] hover:text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))]">
                          <bdi>{sourceNode?.name || t('unknown')}</bdi>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ArrowRight size={14} aria-hidden className="text-[var(--text-secondary)] rtl:-scale-x-100" />
                          <bdi className="text-body text-[var(--text-primary)]">{targetNode?.name || t('unknown')}</bdi>
                          {targetNode?.tier && (
                            <span className={`text-micro px-1.5 py-0.5 rounded whitespace-nowrap ${isControlPlaneTier(targetNode.tier) ? 'bg-[var(--color-critical-bg)] text-[var(--text-primary)] border border-[var(--color-critical)]/40' : 'text-[var(--text-secondary)]'}`}>
                              {tierLabel(targetNode.tier)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-body">{path.pathLength}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-micro font-semibold ${riskBadgeColor(path.riskScore)}`}>
                          {path.riskScore}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-body text-[var(--text-secondary)]"><bdi>{path.attackTechnique}</bdi></td>
                      <td className="px-4 py-3 text-micro font-mono text-[var(--text-secondary)]">{path.mitreId || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-micro font-medium ${statusBadge(path.status)}`}>
                          {statusLabel(path.status)}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={`chain-${path.id}`} className="bg-[var(--bg-secondary)]">
                        <td colSpan={8} className="py-4">
                          {/* Pin the chain to the visible part of the scrolling table; the chain scrolls itself if needed. */}
                          <div className="sticky start-0 w-[100cqw] px-4">
                            <AttackPathChain pathNodes={path.pathNodes} pathEdges={path.pathEdges} />
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination (same pattern as the Identities table) */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-default)]">
              <p className="text-sm text-[var(--text-secondary)]">
                {t('pageOf', { page, total: totalPages })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                >
                  {tCommon('previous')}
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                >
                  {tCommon('next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, suffix, color }: {
  icon: any
  label: string
  value: number
  suffix?: string
  color?: string
}) {
  return (
    <div className="p-4 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} aria-hidden className={color || 'text-[var(--text-secondary)]'} />
        <span className="text-micro text-[var(--text-secondary)] uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-h3 font-bold ${color || 'text-[var(--text-primary)]'}`}>
        {value}{suffix ? <span className="text-caption font-normal text-[var(--text-secondary)] ms-1">{suffix}</span> : null}
      </p>
    </div>
  )
}

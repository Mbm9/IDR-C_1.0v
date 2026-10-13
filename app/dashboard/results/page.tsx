'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Download, RefreshCw, Search, AlertTriangle, Shield, Route,
  Crosshair, UserX, TrendingUp, FileWarning, Bird, CheckCircle2,
  ChevronDown, X,
} from 'lucide-react'
import { formatRelativeTime, formatDateTime } from '@/lib/utils/formatters'
import { useEnumLabel } from '@/components/ui/enum-label'
import { TONE_TEXT, toneBadge, severityTone, tierTone, type Tone } from '@/components/ui/tone'

// ── Types ──

interface UnifiedResult {
  id: string
  findingType: 'violation' | 'attack_path' | 'threat' | 'shadow_admin' | 'peer_anomaly' | 'gpo_risk' | 'canary_trigger'
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: string
  identityId: string | null
  identityName: string | null
  identityType: string | null
  adTier: string | null
  effectiveTier: string | null
  tierViolation: boolean
  detectedAt: string
  resolvedAt: string | null
  category: string
  mitreTechnique: string | null
  riskScore: number | null
  sourceUrl: string
  metadata: Record<string, any>
}

interface ResultsResponse {
  results: UnifiedResult[]
  total: number
  page: number
  pageSize: number
  summary: {
    bySeverity: Record<string, number>
    byType: Record<string, number>
    byStatus: Record<string, number>
    byTier: Record<string, number>
  }
}

type TabKey = 'all' | 'violation' | 'attack_path' | 'threat' | 'shadow_admin' | 'peer_anomaly' | 'gpo_risk' | 'canary_trigger'

// ── Helpers ──

function severityColor(severity: string): string {
  return toneBadge(severityTone(severity))
}

function statusDotColor(status: string): string {
  switch (status) {
    case 'open':
    case 'active': return 'bg-red-500'
    case 'acknowledged':
    case 'investigating': return 'bg-amber-500'
    case 'remediated':
    case 'resolved':
    case 'investigated': return 'bg-green-500'
    case 'excepted':
    case 'contained': return 'bg-blue-500'
    case 'false_positive':
    case 'dismissed': return 'bg-slate-400'
    default: return 'bg-slate-400'
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'violation': return AlertTriangle
    case 'attack_path': return Route
    case 'threat': return Crosshair
    case 'shadow_admin': return UserX
    case 'peer_anomaly': return TrendingUp
    case 'gpo_risk': return FileWarning
    case 'canary_trigger': return Bird
    default: return Shield
  }
}

const TYPE_TONES: Record<string, Tone> = {
  violation: 'critical',
  attack_path: 'nhi',
  threat: 'high',
  shadow_admin: 'critical',
  peer_anomaly: 'info',
  gpo_risk: 'medium',
  canary_trigger: 'low',
}

function typeBadgeColor(type: string): string {
  return toneBadge(TYPE_TONES[type] ?? 'neutral')
}

const TIER_SHORT: Record<string, string> = { tier_0: 'T0', tier_1: 'T1', tier_2: 'T2', unclassified: '?' }

function riskBarWidth(score: number | null): string {
  if (score === null || score === undefined) return '0%'
  return `${Math.min(100, Math.max(0, score))}%`
}

function riskBarColor(score: number | null): string {
  if (score === null) return 'bg-[var(--border-hover)]'
  if (score >= 80) return 'bg-[var(--color-critical)]'
  if (score >= 60) return 'bg-[var(--color-high)]'
  if (score >= 40) return 'bg-[var(--color-medium)]'
  return 'bg-[var(--color-low)]'
}

// ── Export CSV ──

function downloadCsv(data: UnifiedResult[], filename: string) {
  const headers = [
    'ID', 'Type', 'Title', 'Severity', 'Status', 'Identity', 'Identity Type',
    'AD Tier', 'Effective Tier', 'Tier Violation', 'Category', 'MITRE Technique',
    'Risk Score', 'Detected At', 'Resolved At', 'Source URL',
  ]
  const rows = data.map(r => [
    r.id, r.findingType, `"${r.title.replace(/"/g, '""')}"`, r.severity, r.status,
    r.identityName || '', r.identityType || '', r.adTier || '', r.effectiveTier || '',
    r.tierViolation ? 'Yes' : 'No', r.category, r.mitreTechnique || '',
    r.riskScore?.toString() || '', r.detectedAt, r.resolvedAt || '', r.sourceUrl,
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Tab Config ──

const TABS: { key: TabKey; labelKey: string; icon: any }[] = [
  { key: 'all', labelKey: 'allFindings', icon: Shield },
  { key: 'violation', labelKey: 'violations', icon: AlertTriangle },
  { key: 'attack_path', labelKey: 'attackPaths', icon: Route },
  { key: 'threat', labelKey: 'threats', icon: Crosshair },
  { key: 'shadow_admin', labelKey: 'shadowAdmins', icon: UserX },
  { key: 'peer_anomaly', labelKey: 'peerAnomalies', icon: TrendingUp },
  { key: 'gpo_risk', labelKey: 'gpoRisks', icon: FileWarning },
  { key: 'canary_trigger', labelKey: 'canaryTriggers', icon: Bird },
]

// ── Main Page ──

export default function ResultsPage() {
  const t = useTranslations('results')
  const tSev = useTranslations('severity')
  const tCommon = useTranslations('common')
  const tTiers = useTranslations('tiers')
  const locale = useLocale()
  const label = useEnumLabel()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams() ?? new URLSearchParams()

  // State from URL params
  const [activeTab, setActiveTab] = useState<TabKey>((searchParams.get('tab') as TabKey) || 'all')
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'))
  const [severityFilter, setSeverityFilter] = useState(searchParams.get('severity') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [tierFilter, setTierFilter] = useState(searchParams.get('tier') || '')
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'detectedAt')
  const [sortOrder, setSortOrder] = useState(searchParams.get('sortOrder') || 'desc')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  // Data state
  const [data, setData] = useState<ResultsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Sync filters to URL
  const updateUrl = useCallback((params: Record<string, string>) => {
    const sp = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(params)) {
      if (value) sp.set(key, value)
      else sp.delete(key)
    }
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const sp = new URLSearchParams()
      sp.set('page', String(page))
      sp.set('pageSize', '25')
      if (activeTab !== 'all') sp.set('findingType', activeTab)
      if (severityFilter) sp.set('severity', severityFilter)
      if (statusFilter) sp.set('status', statusFilter)
      if (tierFilter) sp.set('tier', tierFilter)
      if (searchQuery) sp.set('search', searchQuery)
      sp.set('sortBy', sortBy)
      sp.set('sortOrder', sortOrder)

      const res = await fetch(`/api/results?${sp}`)
      if (!res.ok) throw new Error('Failed to load')
      const json: ResultsResponse = await res.json()
      setData(json)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, severityFilter, statusFilter, tierFilter, searchQuery, sortBy, sortOrder])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  // Handlers
  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab)
    setPage(1)
    setSelectedRows(new Set())
    updateUrl({ tab: tab === 'all' ? '' : tab, page: '' })
  }, [updateUrl])

  const handleFilterChange = useCallback((key: string, value: string) => {
    switch (key) {
      case 'severity': setSeverityFilter(value); break
      case 'status': setStatusFilter(value); break
      case 'tier': setTierFilter(value); break
    }
    setPage(1)
    updateUrl({ [key]: value, page: '' })
  }, [updateUrl])

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value)
    setPage(1)
    updateUrl({ search: value, page: '' })
  }, [updateUrl])

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      const newOrder = sortOrder === 'desc' ? 'asc' : 'desc'
      setSortOrder(newOrder)
      updateUrl({ sortOrder: newOrder })
    } else {
      setSortBy(column)
      setSortOrder('desc')
      updateUrl({ sortBy: column, sortOrder: 'desc' })
    }
    setPage(1)
  }, [sortBy, sortOrder, updateUrl])

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
    updateUrl({ page: String(newPage) })
  }, [updateUrl])

  const handleExportAll = useCallback(async () => {
    setExporting(true)
    try {
      const sp = new URLSearchParams()
      sp.set('page', '1')
      sp.set('pageSize', '10000')
      if (activeTab !== 'all') sp.set('findingType', activeTab)
      if (severityFilter) sp.set('severity', severityFilter)
      if (statusFilter) sp.set('status', statusFilter)
      if (tierFilter) sp.set('tier', tierFilter)
      if (searchQuery) sp.set('search', searchQuery)
      sp.set('sortBy', sortBy)
      sp.set('sortOrder', sortOrder)

      const res = await fetch(`/api/results?${sp}`)
      if (res.ok) {
        const json: ResultsResponse = await res.json()
        downloadCsv(json.results, `security-results-${new Date().toISOString().slice(0, 10)}.csv`)
      }
    } finally {
      setExporting(false)
    }
  }, [activeTab, severityFilter, statusFilter, tierFilter, searchQuery, sortBy, sortOrder])

  const handleToggleRow = useCallback((id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleToggleAll = useCallback(() => {
    if (!data) return
    if (selectedRows.size === data.results.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(data.results.map(r => r.id)))
    }
  }, [data, selectedRows])

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0
  const summary = data?.summary || { bySeverity: {}, byType: {}, byStatus: {}, byTier: {} }
  const unresolvedCount = Object.entries(summary.byStatus)
    .filter(([k]) => !['remediated', 'resolved', 'investigated', 'false_positive', 'dismissed'].includes(k))
    .reduce((sum, [, v]) => sum + v, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-h2 font-bold text-[var(--text-primary)]">{t('title')}</h1>
          <p className="text-body text-[var(--text-secondary)] mt-1">{t('description')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-micro text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={() => setAutoRefresh(!autoRefresh)}
              className="rounded border-[var(--border-default)]"
            />
            {t('autoRefresh')}
          </label>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            aria-label={t('refresh')}
            title={t('refresh')}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-badge)] text-body text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-[var(--radius-badge)] hover:opacity-90 transition-opacity disabled:opacity-50 text-body"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 85%, black)' }}
          >
            <Download size={14} aria-hidden="true" />
            {t('exportAll')}
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      {data && (
        <div className="flex flex-wrap gap-3" role="status">
          <SummaryPill color="red" label={tSev('critical')} count={summary.bySeverity.critical || 0} />
          <SummaryPill color="orange" label={tSev('high')} count={summary.bySeverity.high || 0} />
          <SummaryPill color="amber" label={tSev('medium')} count={summary.bySeverity.medium || 0} />
          <SummaryPill color="green" label={tSev('low')} count={summary.bySeverity.low || 0} />
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-full">
            <span className="text-micro font-semibold text-[var(--text-primary)]">{data.total}</span>
            <span className="text-micro text-[var(--text-secondary)]">{t('totalFindings')}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-full">
            <span className="text-micro font-semibold text-[var(--text-primary)]">{unresolvedCount}</span>
            <span className="text-micro text-[var(--text-secondary)]">{t('unresolved')}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-[var(--border-default)] -mb-px" role="tablist" aria-label={t('findingTypes')}>
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          const count = tab.key === 'all' ? (data?.total || 0) : (summary.byType[tab.key] || 0)
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-body font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? `border-[var(--color-info)] ${TONE_TEXT.info}`
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {t(tab.labelKey)}
              {count > 0 && (
                <span className={`text-micro px-1.5 py-0.5 rounded-full ${
                  isActive ? toneBadge('info') : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden="true" />
          <input
            type="search"
            aria-label={t('searchFindings')}
            placeholder={tCommon('search')}
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            className="w-full ps-9 pe-8 py-2 rounded-[var(--radius-badge)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-body"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearch('')}
              aria-label={t('clearSearch')}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <select
          value={severityFilter}
          onChange={e => handleFilterChange('severity', e.target.value)}
          aria-label={t('filterSeverity')}
          className="px-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-badge)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)]"
        >
          <option value="">{tSev('allSeverities')}</option>
          <option value="critical">{tSev('critical')}</option>
          <option value="high">{tSev('high')}</option>
          <option value="medium">{tSev('medium')}</option>
          <option value="low">{tSev('low')}</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => handleFilterChange('status', e.target.value)}
          aria-label={t('filterStatus')}
          className="px-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-badge)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)]"
        >
          <option value="">{t('allStatuses')}</option>
          {['open', 'active', 'acknowledged', 'investigating', 'remediated', 'resolved', 'excepted'].map((s) => (
            <option key={s} value={s}>{label('findingStatus', s)}</option>
          ))}
        </select>

        <select
          value={tierFilter}
          onChange={e => handleFilterChange('tier', e.target.value)}
          aria-label={t('filterTier')}
          className="px-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-badge)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)]"
        >
          <option value="">{tTiers('allTiers')}</option>
          <option value="tier_0">{tTiers('tier_0')}</option>
          <option value="tier_1">{tTiers('tier_1')}</option>
          <option value="tier_2">{tTiers('tier_2')}</option>
          <option value="unclassified">{tTiers('unclassified')}</option>
        </select>

        <select
          value={sortBy}
          onChange={e => handleSort(e.target.value)}
          aria-label={t('sortBy')}
          className="px-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-badge)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)]"
        >
          <option value="detectedAt">{t('sortDetected')}</option>
          <option value="severity">{t('sortSeverity')}</option>
          <option value="riskScore">{t('sortRiskScore')}</option>
          <option value="identityName">{t('sortIdentity')}</option>
        </select>

        {(severityFilter || statusFilter || tierFilter || searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setSeverityFilter('')
              setStatusFilter('')
              setTierFilter('')
              setSearchQuery('')
              setPage(1)
              updateUrl({ severity: '', status: '', tier: '', search: '', page: '' })
            }}
            className={`text-body hover:underline ${TONE_TEXT.info}`}
          >
            {tCommon('clearFilters')}
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[var(--color-info)]/5 border border-[var(--color-info)]/20 rounded-[var(--radius-card)]">
          <span className="text-body text-[var(--text-secondary)]" role="status">
            {t('selectedCount', { count: selectedRows.size })}
          </span>
          <button
            type="button"
            onClick={() => {
              const selected = (data?.results || []).filter(r => selectedRows.has(r.id))
              downloadCsv(selected, `selected-results-${new Date().toISOString().slice(0, 10)}.csv`)
            }}
            className="px-3 py-1 text-micro text-white rounded-[var(--radius-badge)]"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 85%, black)' }}
          >
            {t('exportFiltered')}
          </button>
          <button
            type="button"
            onClick={() => setSelectedRows(new Set())}
            className="px-3 py-1 text-micro border border-[var(--border-default)] rounded-[var(--radius-badge)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
          >
            {tCommon('cancel')}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`p-4 rounded-[var(--radius-card)] ${toneBadge('critical')}`} role="alert">
          {t('failedToLoad')}
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--bg-primary)] rounded-[var(--radius-card)] border border-[var(--border-default)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        {loading && !data ? (
          <div className="p-12 text-center text-[var(--text-secondary)] animate-pulse" role="status">
            {tCommon('loading')}
          </div>
        ) : !data || data.results.length === 0 ? (
          <div className="p-12 text-center">
            <Shield size={48} className="mx-auto mb-3 opacity-20 text-[var(--text-tertiary)]" aria-hidden="true" />
            <p className="text-body font-medium text-[var(--text-secondary)]">{tCommon('noResults')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-micro uppercase tracking-wider">
                    <th scope="col" className="px-3 py-3 text-start w-8">
                      <input
                        type="checkbox"
                        checked={selectedRows.size === data.results.length && data.results.length > 0}
                        onChange={handleToggleAll}
                        aria-label={t('selectAll')}
                        className="rounded border-[var(--border-default)]"
                      />
                    </th>
                    <th scope="col" className="px-3 py-3 text-start">#</th>
                    <th scope="col" className="px-3 py-3 text-start min-w-[280px]">{t('finding')}</th>
                    <th scope="col" className="px-3 py-3 text-start">{t('type')}</th>
                    <SortHeader label={t('colSeverity')} column="severity" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
                    <th scope="col" className="px-3 py-3 text-start min-w-[140px]">{t('colIdentity')}</th>
                    <th scope="col" className="px-3 py-3 text-center">{t('colTier')}</th>
                    <SortHeader label={t('colRisk')} column="riskScore" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="center" />
                    <th scope="col" className="px-3 py-3 text-center">{t('colStatus')}</th>
                    <SortHeader label={t('detected')} column="detectedAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="end" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {data.results.map((result, idx) => {
                    const Icon = typeIcon(result.findingType)
                    const rowNum = (data.page - 1) * data.pageSize + idx + 1
                    return (
                      <tr
                        key={result.id}
                        className={`hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer ${
                          selectedRows.has(result.id) ? 'bg-[var(--color-info)]/5' : ''
                        }`}
                        onClick={() => router.push(result.sourceUrl)}
                      >
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedRows.has(result.id)}
                            onChange={() => handleToggleRow(result.id)}
                            aria-label={t('selectRow', { title: result.title })}
                            className="rounded border-[var(--border-default)]"
                          />
                        </td>
                        <td className="px-3 py-3 text-micro text-[var(--text-secondary)]">{rowNum}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-start gap-2">
                            <Icon size={14} className="text-[var(--text-secondary)] mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="text-body font-medium text-[var(--text-primary)] truncate max-w-[350px]">
                                <Link href={result.sourceUrl} onClick={(e) => e.stopPropagation()} className="hover:underline">
                                  {result.title}
                                </Link>
                              </p>
                              {result.mitreTechnique && (
                                <span className="text-micro font-mono text-[var(--text-secondary)]"><bdi>{result.mitreTechnique}</bdi></span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-medium whitespace-nowrap ${typeBadgeColor(result.findingType)}`}>
                            {t(TABS.find(tab => tab.key === result.findingType)?.labelKey || 'allFindings')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-micro font-semibold whitespace-nowrap ${severityColor(result.severity)}`}>
                            {tSev(result.severity)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {result.identityName ? (
                            <div className="flex items-center gap-2">
                              <span className="text-body text-[var(--text-primary)] truncate max-w-[120px]"><bdi>{result.identityName}</bdi></span>
                              {result.identityType && (
                                <span className={`text-micro px-1.5 py-0.5 rounded whitespace-nowrap ${toneBadge(result.identityType === 'human' ? 'info' : 'nhi')}`}>
                                  {label('identityType', result.identityType)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-micro text-[var(--text-secondary)]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {result.adTier ? (
                            result.effectiveTier && result.effectiveTier !== result.adTier ? (
                              <span
                                className={`inline-flex items-center gap-1 whitespace-nowrap text-micro px-1.5 py-0.5 rounded font-medium ${toneBadge('critical')}`}
                                title={t('tierEscalation', { assigned: tTiers.has(result.adTier) ? tTiers(result.adTier) : result.adTier, effective: tTiers.has(result.effectiveTier) ? tTiers(result.effectiveTier) : result.effectiveTier })}
                              >
                                <span>{TIER_SHORT[result.adTier] ?? result.adTier}</span>
                                <span className="inline-block rtl:-scale-x-100" aria-hidden="true">→</span>
                                <span>{TIER_SHORT[result.effectiveTier] ?? result.effectiveTier}</span>
                              </span>
                            ) : (
                              <span className={`text-micro px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${toneBadge(tierTone(result.adTier))}`}>
                                {tTiers.has(result.adTier) ? tTiers(result.adTier) : result.adTier}
                              </span>
                            )
                          ) : (
                            <span className="text-micro text-[var(--text-secondary)]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {result.riskScore !== null ? (
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-12 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden" aria-hidden="true">
                                <div
                                  className={`h-full rounded-full ${riskBarColor(result.riskScore)}`}
                                  style={{ width: riskBarWidth(result.riskScore) }}
                                />
                              </div>
                              <span className="text-micro font-medium text-[var(--text-secondary)]">{result.riskScore}</span>
                            </div>
                          ) : (
                            <span className="text-micro text-[var(--text-secondary)]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center gap-1.5 justify-center">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor(result.status)}`} aria-hidden="true" />
                            <span className="text-micro text-[var(--text-secondary)] whitespace-nowrap">
                              {label('findingStatus', result.status)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-end">
                          <time
                            className="text-micro text-[var(--text-secondary)] whitespace-nowrap"
                            dateTime={result.detectedAt}
                            title={formatDateTime(result.detectedAt, locale)}
                          >
                            {formatRelativeTime(result.detectedAt, locale)}
                          </time>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-default)]">
                <p className="text-body text-[var(--text-secondary)]">
                  {t('showingRange', { from: (data.page - 1) * data.pageSize + 1, to: Math.min(data.page * data.pageSize, data.total), total: data.total })}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-body border border-[var(--border-default)] rounded-[var(--radius-badge)] text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)]"
                  >
                    {tCommon('previous')}
                  </button>
                  {/* Page number pills */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (page <= 3) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = page - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => handlePageChange(pageNum)}
                        aria-current={page === pageNum ? 'page' : undefined}
                        aria-label={t('goToPage', { page: pageNum })}
                        className={`px-3 py-1.5 text-body border rounded-[var(--radius-badge)] ${
                          page === pageNum
                            ? 'text-white border-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_85%,black)]'
                            : 'border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-body border border-[var(--border-default)] rounded-[var(--radius-badge)] text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)]"
                  >
                    {tCommon('next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub Components ──

function SortHeader({ label, column, sortBy, sortOrder, onSort, align }: {
  label: string
  column: string
  sortBy: string
  sortOrder: string
  onSort: (column: string) => void
  align: 'center' | 'end'
}) {
  const active = sortBy === column
  return (
    <th
      scope="col"
      aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`px-3 py-3 whitespace-nowrap ${align === 'center' ? 'text-center' : 'text-end'}`}
    >
      <button type="button" onClick={() => onSort(column)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)]">
        {label}
        {active && <span aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}

function SummaryPill({ color, label, count }: { color: string; label: string; count: number }) {
  const tones: Record<string, Tone> = { red: 'critical', orange: 'high', amber: 'medium', green: 'low' }
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${toneBadge(tones[color] ?? 'neutral')}`}>
      <span className="text-micro font-bold">{count}</span>
      <span className="text-micro">{label}</span>
    </div>
  )
}

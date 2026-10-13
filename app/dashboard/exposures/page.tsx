'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { ShieldAlert, KeyRound, ArrowUpCircle, GitBranch, Anchor, ScrollText, FileKey, FileWarning, Users, X, List, Share2 } from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { gridProps } from '@/components/ui/chart-theme'
import { CsvExportButton } from '@/components/ui/csv-export-button'
import { ForceGraph, type FgNode, type FgLink } from '@/components/dashboard/force-graph'
import { formatRelativeTime } from '@/lib/utils/formatters'

type ImpactCategory = 'credential_theft' | 'privilege_escalation' | 'lateral_movement' | 'persistence'
type ExposureCategory = 'identity' | 'certificate' | 'gpo' | 'secret'
type Severity = 'critical' | 'high' | 'medium' | 'low'

interface Finding {
  id: string
  category: ExposureCategory
  type: string
  title: string
  subjectName: string
  identityId: string | null
  severity: Severity
  impact: ImpactCategory
  detectedAt: string
  /** Localized catalog name (newer API, by locale cookie) */
  typeLabel?: string
}
interface ImpactGroup {
  category: ImpactCategory
  /** Localized impact name (newer API, by locale cookie) */
  label?: string
  count: number
  bySeverity: Record<Severity, number>
  findings: Finding[]
}
interface ExposuresResponse {
  exposureScore: number
  totalOpen: number
  bySeverity: Record<Severity, number>
  byCategory: Record<ExposureCategory, number>
  impacts: ImpactGroup[]
  assessedAt: string
}
interface TrendPoint {
  capturedAt: string
  exposureScore: number
  totalOpen: number
  bySeverity: Record<Severity, number> | null
  byCategory: Record<ExposureCategory, number> | null
  byImpact: Record<ImpactCategory, number> | null
}

const IMPACT_META: Record<ImpactCategory, { icon: typeof KeyRound; label: string; color: string }> = {
  credential_theft: { icon: KeyRound, label: 'Credential Theft', color: '#f43f5e' },
  privilege_escalation: { icon: ArrowUpCircle, label: 'Privilege Escalation', color: '#a855f7' },
  lateral_movement: { icon: GitBranch, label: 'Lateral Movement', color: '#0ea5e9' },
  persistence: { icon: Anchor, label: 'Persistence', color: '#14b8a6' },
}
// `preview: true` = no live collector yet. Identity exposures are collected live from
// AD via LDAP; certificate (AD CS), GPO, and secret exposures require dedicated
// collectors that aren't shipped yet, so on a real deployment these categories are
// empty (or populated only by demo seed data). Flagged in the UI so it isn't misleading.
const CATEGORY_META: Record<ExposureCategory, { icon: typeof Users; label: string; color: string; preview?: boolean }> = {
  identity: { icon: Users, label: 'Identity', color: '#6366f1' },
  certificate: { icon: FileKey, label: 'Certificate (AD CS)', color: '#06b6d4', preview: true },
  gpo: { icon: ScrollText, label: 'GPO', color: '#f59e0b', preview: true },
  secret: { icon: FileWarning, label: 'Secrets', color: '#ef4444', preview: true },
}
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']
const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'var(--color-critical)', high: 'var(--color-high)', medium: 'var(--color-medium)', low: 'var(--color-low)',
}
// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-[var(--color-critical-bg)] text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]',
  high: 'bg-[var(--color-high-bg)] text-[color:color-mix(in_srgb,var(--color-high)_60%,var(--text-primary))]',
  medium: 'bg-[var(--color-medium-bg)] text-[color:color-mix(in_srgb,var(--color-medium)_60%,var(--text-primary))]',
  low: 'bg-[var(--color-low-bg)] text-[color:color-mix(in_srgb,var(--color-low)_60%,var(--text-primary))]',
}
const ACTIVE_CHIP = 'border-[var(--color-info)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))] bg-[var(--color-info-bg)]'
const IDLE_CHIP = 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

async function fetchExposures(category: string): Promise<ExposuresResponse> {
  const qs = category === 'all' ? '' : `?category=${category}`
  const res = await fetch(`/api/exposures${qs}`)
  if (!res.ok) throw new Error('Failed to load exposures')
  return res.json()
}
async function fetchTrends(): Promise<{ points: TrendPoint[] }> {
  const res = await fetch('/api/exposures/trends?days=30')
  if (!res.ok) return { points: [] }
  return res.json()
}
async function fetchGraph(): Promise<{ nodes: FgNode[]; links: FgLink[] }> {
  const res = await fetch('/api/exposures/graph')
  if (!res.ok) return { nodes: [], links: [] }
  return res.json()
}

type TrendMetric = 'score' | 'severity' | 'category' | 'impact'

const GRAPH_COLORS: Record<string, string> = {
  identity: '#6366f1', certificate: '#06b6d4', gpo: '#f59e0b', secret: '#ef4444', impact: '#a855f7',
}
const graphColorOf = (g: string) => GRAPH_COLORS[g] ?? '#64748b'

const chartTooltip = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
  borderRadius: 8, fontSize: 12, color: 'var(--text-primary)',
}

export default function ExposuresPage() {
  const t = useTranslations('exposures')
  const tSev = useTranslations('severity')
  const tEnum = useTranslations('securityEnums')
  const locale = useLocale()
  const rtl = locale === 'ar'
  const sevLabel = (s: string) => (tSev.has(s) ? tSev(s) : humanize(s))
  const catLabel = (c: string) => (t.has(`categories.${c}`) ? t(`categories.${c}`) : (CATEGORY_META as any)[c]?.label ?? humanize(c))
  const impactLabel = (i: string) => (t.has(`impacts.${i}`) ? t(`impacts.${i}`) : (IMPACT_META as any)[i]?.label ?? humanize(i))
  const typeLabel = (type: string) => {
    if (t.has(`types.${type}`)) return t(`types.${type}`)
    if (tEnum.has(`violationTypes.${type}`)) return tEnum(`violationTypes.${type}`)
    return type.startsWith('esc') ? type.toUpperCase() : humanize(type)
  }
  const [category, setCategory] = useState<'all' | ExposureCategory>('all')
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null)
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('severity')
  const [view, setView] = useState<'list' | 'graph'>('list')

  const { data, isLoading, error } = useQuery({ queryKey: ['exposures', category], queryFn: () => fetchExposures(category) })
  const { data: trend } = useQuery({ queryKey: ['exposures-trends'], queryFn: fetchTrends })
  const { data: graph } = useQuery({ queryKey: ['exposures-graph'], queryFn: fetchGraph, enabled: view === 'graph' })

  const scoreColor = (score: number) =>
    score >= 60 ? 'text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))]' : score >= 25 ? 'text-[color:color-mix(in_srgb,var(--color-high)_70%,var(--text-primary))]' : 'text-emerald-500'

  // Flatten trend snapshots for the charts.
  const trendData = useMemo(() => (trend?.points ?? []).map((p) => ({
    t: new Date(p.capturedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    score: p.exposureScore,
    open: p.totalOpen,
    ...(p.bySeverity ?? {}),
    ...(p.byCategory ?? {}),
    ...(p.byImpact ?? {}),
  })), [trend, locale])

  // Series config per trend metric.
  const trendSeries: { key: string; label: string; color: string }[] =
    trendMetric === 'severity' ? SEVERITY_ORDER.map((s) => ({ key: s, label: sevLabel(s), color: SEVERITY_COLORS[s] }))
    : trendMetric === 'category' ? (Object.keys(CATEGORY_META) as ExposureCategory[]).map((c) => ({ key: c, label: catLabel(c), color: CATEGORY_META[c].color }))
    : trendMetric === 'impact' ? (Object.keys(IMPACT_META) as ImpactCategory[]).map((i) => ({ key: i, label: impactLabel(i), color: IMPACT_META[i].color }))
    : [{ key: 'score', label: t('exposureScore'), color: 'var(--color-high-text)' }]

  // Donut data (current severity distribution).
  const donutData = data ? SEVERITY_ORDER.map((s) => ({ name: s, value: data.bySeverity[s] })).filter((d) => d.value > 0) : []

  // Impact bar data.
  const impactBar = data ? (Object.keys(IMPACT_META) as ImpactCategory[]).map((i) => ({
    name: data.impacts.find((g) => g.category === i)?.label ?? impactLabel(i), value: data.impacts.find((g) => g.category === i)?.count ?? 0, color: IMPACT_META[i].color,
  })).filter((d) => d.value > 0) : []

  // Apply the severity filter to the impact groups.
  const displayImpacts: ImpactGroup[] = useMemo(() => {
    if (!data) return []
    if (!severityFilter) return data.impacts
    return data.impacts.map((g) => {
      const findings = g.findings.filter((f) => f.severity === severityFilter)
      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
      findings.forEach((f) => bySeverity[f.severity]++)
      return { ...g, findings, count: findings.length, bySeverity }
    }).filter((g) => g.count > 0)
  }, [data, severityFilter])

  const trendMetrics: { key: TrendMetric; label: string }[] = [
    { key: 'score', label: t('metricScore') },
    { key: 'severity', label: t('metricSeverity') },
    { key: 'category', label: t('metricCategory') },
    { key: 'impact', label: t('metricImpact') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldAlert aria-hidden className="w-6 h-6 text-[color:color-mix(in_srgb,var(--color-high)_70%,var(--text-primary))]" />
            {t('title')}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div role="group" aria-label={t('viewMode')} className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
            <button onClick={() => setView('list')} aria-pressed={view === 'list'}
              className={`px-2.5 py-1.5 flex items-center gap-1.5 text-sm ${view === 'list' ? ACTIVE_CHIP : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>
              <List aria-hidden className="w-4 h-4" />{t('viewList')}
            </button>
            <button onClick={() => setView('graph')} aria-pressed={view === 'graph'}
              className={`px-2.5 py-1.5 flex items-center gap-1.5 text-sm border-s border-[var(--border-default)] ${view === 'graph' ? ACTIVE_CHIP : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>
              <Share2 aria-hidden className="w-4 h-4" />{t('viewGraph')}
            </button>
          </div>
        {data && data.totalOpen > 0 && (
          <CsvExportButton
            filename="ad-exposures"
            label={t('export')}
            columns={[
              { key: 'category', label: t('colCategory') },
              { key: 'type', label: t('colType') },
              { key: 'subjectName', label: t('colSubject') },
              { key: 'impact', label: t('metricImpact') },
              { key: 'severity', label: t('colSeverity') },
              { key: 'detectedAt', label: t('colDetected') },
            ]}
            fetchData={async () =>
              data.impacts.flatMap((g) =>
                g.findings.map((f) => ({
                  category: catLabel(f.category),
                  type: f.typeLabel ?? typeLabel(f.type),
                  subjectName: f.subjectName,
                  impact: g.label ?? impactLabel(g.category),
                  severity: sevLabel(f.severity),
                  detectedAt: f.detectedAt,
                })),
              )
            }
          />
        )}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-[var(--color-critical)] bg-[var(--color-critical-bg)] p-6">
          <p className="font-medium text-[var(--text-primary)]">{t('failedToLoad')}</p>
        </div>
      )}

      {data && (
        <>
          {/* Charts row: score gauge + severity donut + trend */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Score + open */}
            <div className="lg:col-span-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 flex flex-col justify-center">
              <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{t('exposureScore')}</p>
              <p className={`text-4xl font-bold mt-1 ${scoreColor(data.exposureScore)}`}>{data.exposureScore}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-3">{t('openFindings')}</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{data.totalOpen}</p>
            </div>

            {/* Severity donut — clickable to filter */}
            <div className="lg:col-span-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{t('bySeverityTitle')}</p>
                {severityFilter && (
                  <button onClick={() => setSeverityFilter(null)} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-0.5">
                    <X aria-hidden className="w-3 h-3" />{t('clearFilter')}
                  </button>
                )}
              </div>
              <div dir="ltr">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={42} outerRadius={62} paddingAngle={2} stroke="none"
                    onClick={(d: any) => setSeverityFilter((cur) => (cur === d?.name ? null : (d?.name as Severity)))}
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={SEVERITY_COLORS[d.name as Severity]}
                        aria-label={`${sevLabel(d.name)}: ${d.value}`}
                        opacity={!severityFilter || severityFilter === d.name ? 1 : 0.3}
                        style={{ cursor: 'pointer', outline: 'none' }} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltip} formatter={(v: any, n: any) => [v, sevLabel(String(n))]} />
                </PieChart>
              </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 -mt-2">
                {SEVERITY_ORDER.filter((s) => data.bySeverity[s] > 0).map((s) => (
                  <button key={s} onClick={() => setSeverityFilter((cur) => (cur === s ? null : s))}
                    aria-pressed={severityFilter === s}
                    className={`text-xs flex items-center gap-1 ${severityFilter && severityFilter !== s ? 'line-through' : ''}`}>
                    <span aria-hidden className={`w-2 h-2 rounded-full ${severityFilter && severityFilter !== s ? 'opacity-40' : ''}`} style={{ background: SEVERITY_COLORS[s] }} />
                    <span className="text-[var(--text-secondary)]">{sevLabel(s)}</span>
                    <span className="text-[var(--text-primary)] font-medium">{data.bySeverity[s]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Trend with metric toggle */}
            <div className="lg:col-span-7 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 min-w-0">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{t('trend')}</p>
                <div role="group" aria-label={t('trendMetric')} className="flex gap-1 flex-wrap">
                  {trendMetrics.map((m) => (
                    <button key={m.key} onClick={() => setTrendMetric(m.key)} aria-pressed={trendMetric === m.key}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${trendMetric === m.key ? ACTIVE_CHIP : IDLE_CHIP}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {trendData.length > 1 ? (
                <div dir="ltr">
                <ResponsiveContainer width="100%" height={180}>
                  {trendMetric === 'score' ? (
                    <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-high)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--color-high)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="t" reversed={rtl} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <YAxis orientation={rtl ? 'right' : 'left'} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <Tooltip contentStyle={chartTooltip} />
                      <Area type="monotone" dataKey="score" name={t('exposureScore')} stroke="var(--color-high)" strokeWidth={2} fill="url(#scoreGrad)" />
                      <Line type="monotone" dataKey="open" name={t('openFindings')} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="4 3" dot={false} />
                    </AreaChart>
                  ) : (
                    <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="t" reversed={rtl} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <YAxis orientation={rtl ? 'right' : 'left'} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <Tooltip contentStyle={chartTooltip} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {trendSeries.map((s) => (
                        <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="1"
                          stroke={s.color} fill={s.color} fillOpacity={0.5} strokeWidth={1.5} />
                      ))}
                    </AreaChart>
                  )}
                </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)] py-12 text-center">{t('trendEmpty')}</p>
              )}
            </div>
          </div>

          {/* Impact bar */}
          {impactBar.length > 0 && (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)] mb-2">{t('byImpactTitle')}</p>
              <div dir="ltr">
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={impactBar} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                  <XAxis type="number" reversed={rtl} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <YAxis type="category" dataKey="name" width={130} orientation={rtl ? 'right' : 'left'} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={chartTooltip} cursor={{ fill: 'var(--bg-secondary)' }} />
                  <Bar dataKey="value" name={t('findings')} radius={rtl ? [4, 0, 0, 4] : [0, 4, 4, 0]}>
                    {impactBar.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Graph view */}
          {view === 'graph' && (
            graph && graph.nodes.length > 0 ? (
              <ForceGraph
                nodes={graph.nodes}
                links={graph.links}
                colorOf={graphColorOf}
                height={580}
                searchPlaceholder={t('graphSearch')}
                filterGroups={[
                  { key: 'identity', label: catLabel('identity'), color: GRAPH_COLORS.identity },
                  { key: 'certificate', label: catLabel('certificate'), color: GRAPH_COLORS.certificate },
                  { key: 'gpo', label: catLabel('gpo'), color: GRAPH_COLORS.gpo },
                  { key: 'secret', label: catLabel('secret'), color: GRAPH_COLORS.secret },
                ]}
              />
            ) : (
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-10 text-center text-sm text-[var(--text-secondary)]">
                {graph ? t('noFindings') : t('graphLoading')}
              </div>
            )
          )}

          {view === 'list' && (<>
          {/* Category tabs */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategory('all')}
              aria-pressed={category === 'all'}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${category === 'all' ? ACTIVE_CHIP : IDLE_CHIP}`}
            >
              {t('all')} ({Object.values(data.byCategory).reduce((a, b) => a + b, 0)})
            </button>
            {(Object.keys(CATEGORY_META) as ExposureCategory[]).map((cat) => {
              const Icon = CATEGORY_META[cat].icon
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  aria-pressed={category === cat}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center gap-1.5 transition-colors ${category === cat ? ACTIVE_CHIP : IDLE_CHIP}`}
                >
                  <Icon aria-hidden className="w-3.5 h-3.5" style={{ color: CATEGORY_META[cat].color }} />
                  {catLabel(cat)} ({data.byCategory[cat] ?? 0})
                  {CATEGORY_META[cat].preview && (
                    <span className="ms-0.5 px-1 rounded text-[10px] font-semibold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] uppercase tracking-wide">{t('preview')}</span>
                  )}
                </button>
              )
            })}
            {severityFilter && (
              <span className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] flex items-center gap-1.5">
                {t('filteredBy')}: <span className={`px-1.5 rounded ${SEVERITY_STYLES[severityFilter]}`}>{sevLabel(severityFilter)}</span>
                <button onClick={() => setSeverityFilter(null)} aria-label={t('clearFilter')}><X aria-hidden className="w-3.5 h-3.5" /></button>
              </span>
            )}
          </div>

          {category !== 'all' && CATEGORY_META[category]?.preview && (
            <div role="note" className="rounded-lg border border-[var(--color-medium)]/40 bg-[var(--color-medium-bg)] px-3 py-2 text-sm text-[var(--text-secondary)] flex items-start gap-2">
              <ShieldAlert aria-hidden className="w-4 h-4 mt-0.5 flex-shrink-0 text-[color:color-mix(in_srgb,var(--color-medium)_70%,var(--text-primary))]" />
              <span>
                <span className="font-medium text-[var(--text-primary)]">{t('collectorNotEnabled', { category: catLabel(category) })}</span>{' '}
                {t('collectorNotEnabledBody', { category: catLabel(category) })}
              </span>
            </div>
          )}

          {(data.totalOpen === 0 || displayImpacts.length === 0) && (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-10 text-center">
              <ShieldAlert aria-hidden className="w-10 h-10 text-[color:color-mix(in_srgb,var(--color-low)_70%,var(--text-primary))] mx-auto mb-3" />
              <p className="font-medium text-[var(--text-primary)]">{data.totalOpen === 0 ? t('noFindings') : t('noFindingsFiltered')}</p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">{t('scanHint')}</p>
            </div>
          )}

          {/* Impact groups */}
          {displayImpacts.map((group) => {
            const meta = IMPACT_META[group.category]
            const Icon = meta?.icon ?? ShieldAlert
            return (
              <div key={group.category} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] overflow-hidden">
                <div className="flex items-center justify-between gap-2 flex-wrap px-4 sm:px-5 py-3 border-b border-[var(--border-default)] bg-[var(--bg-secondary)]">
                  <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Icon aria-hidden className="w-4 h-4" style={{ color: meta?.color }} />
                    {group.label ?? impactLabel(group.category)}
                    <span className="text-xs font-normal text-[var(--text-secondary)]">({group.count})</span>
                  </h3>
                  <div className="flex gap-1.5 flex-wrap">
                    {SEVERITY_ORDER.map((sev) =>
                      group.bySeverity[sev] > 0 ? (
                        <span key={sev} className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_STYLES[sev]}`}>
                          {t('severityCount', { count: group.bySeverity[sev], severity: sevLabel(sev) })}
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={group.label ?? impactLabel(group.category)}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-start text-xs uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border-default)]">
                        <th className="px-5 py-2 font-medium">{t('colCategory')}</th>
                        <th className="px-5 py-2 font-medium">{t('colSubject')}</th>
                        <th className="px-5 py-2 font-medium">{t('colType')}</th>
                        <th className="px-5 py-2 font-medium">{t('colSeverity')}</th>
                        <th className="px-5 py-2 font-medium">{t('colDetected')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.findings.map((f) => {
                        const CatIcon = CATEGORY_META[f.category]?.icon ?? ShieldAlert
                        return (
                          <tr key={f.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--bg-secondary)]">
                            <td className="px-5 py-2.5">
                              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                                <CatIcon aria-hidden className="w-3.5 h-3.5" style={{ color: CATEGORY_META[f.category]?.color }} /> {catLabel(f.category)}
                              </span>
                            </td>
                            <td className="px-5 py-2.5">
                              {f.identityId ? (
                                <a href={`/dashboard/identities/${f.identityId}`} className="text-[var(--text-primary)] hover:underline"><bdi>{f.subjectName}</bdi></a>
                              ) : (
                                <bdi className="text-[var(--text-primary)]" title={f.title}>{f.subjectName}</bdi>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-[var(--text-secondary)]">{f.typeLabel ?? typeLabel(f.type)}</td>
                            <td className="px-5 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${SEVERITY_STYLES[f.severity]}`}>{sevLabel(f.severity)}</span>
                            </td>
                            <td className="px-5 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{formatRelativeTime(new Date(f.detectedAt))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          </>)}
        </>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Network, Route, Loader2, ArrowRight, Target, Zap, ChevronRight } from 'lucide-react'
import { ForceGraph, type FgNode, type FgLink } from './force-graph'
import { useAppRole } from '@/lib/hooks/use-app-role'

interface QueryDef { id: string; label: string; category: 'paths' | 'privilege' | 'exposure' | 'recon'; description: string }
interface GraphResult { nodes: FgNode[]; links: FgLink[]; summary: string; found?: boolean; hops?: number }
interface SearchResult { id: string; label: string; type: string; tier?: string }

interface ChokeFix {
  rank: number; source: string; target: string; sourceName: string; targetName: string
  edgeType: string; technique: string; pathsBroken: number; cumulativeBroken: number
  cumulativePct: number; dangerous: boolean
}
interface ChokeResult { totalPaths: number; fixes: ChokeFix[]; nodes: FgNode[]; links: FgLink[]; summary: string }
interface SimResult {
  before: number; after: number; pathsBroken: number; pctReduction: number
  targetLabel: string; kind: 'node' | 'edge'; summary: string; capped: boolean
}

const NODE_COLORS: Record<string, string> = {
  identity: '#2563EB', group: '#CA8A04', resource: '#5F6B7A', computer: '#4F46E5',
  gpo: '#0891B2', domain: '#DC2626', ou: '#7C3AED', unknown: '#94a3b8',
}
const colorOf = (g: string) => NODE_COLORS[g] ?? NODE_COLORS.unknown

type T = ReturnType<typeof useTranslations>

/** Query names/descriptions come from the API in English; translate by query id. */
function queryLabel(t: T, q: QueryDef) {
  return t.has(`queries.${q.id}.label`) ? t(`queries.${q.id}.label`) : q.label
}
function queryDescription(t: T, q: QueryDef) {
  return t.has(`queries.${q.id}.description`) ? t(`queries.${q.id}.description`) : q.description
}
/**
 * The server builds English summaries ("12 Kerberoastable account(s)"); rebuild them
 * from the count so they read naturally (and pluralise) in every locale.
 */
function querySummary(t: T, id: string | null, summary: string) {
  const fixed: Record<string, string> = {
    'No Tier 0 assets found': 'summaryNoTier0',
    'Unknown query': 'summaryUnknown',
  }
  if (fixed[summary]) return t(fixed[summary])
  const m = summary.match(/^(\d+)\s/)
  if (id && m && t.has(`queries.${id}.summary`)) return t(`queries.${id}.summary`, { count: Number(m[1]) })
  return summary
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

function NodePicker({ id, label, value, onChange }: { id: string; label: string; value: SearchResult | null; onChange: (v: SearchResult | null) => void }) {
  const t = useTranslations('graphExplorer')
  const tTiers = useTranslations('tiers')
  const tFg = useTranslations('forceGraph')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['graph-search', q],
    queryFn: () => getJSON<{ results: SearchResult[] }>(`/api/graph/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  })
  return (
    <div className="relative flex-1 min-w-[160px]">
      <label htmlFor={id} className="text-xs text-[var(--text-secondary)]">{label}</label>
      <input
        id={id}
        value={value ? value.label : q}
        onChange={(e) => { onChange(null); setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={t('searchEntity')}
        autoComplete="off"
        className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-info)]"
      />
      {open && q.trim().length >= 2 && data && data.results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] shadow-lg">
          {data.results.map((r) => (
            <button key={r.id} onClick={() => { onChange(r); setOpen(false) }}
              className="w-full text-start px-2.5 py-1.5 text-sm hover:bg-[var(--bg-secondary)] flex items-center justify-between gap-2">
              <bdi className="text-[var(--text-primary)] truncate">{r.label}</bdi>
              <span className="text-[10px] text-[var(--text-secondary)] shrink-0">
                {tFg.has(`groups.${r.type}`) ? tFg(`groups.${r.type}`) : r.type}
                {r.tier && r.tier !== 'unclassified' ? ` · ${tTiers.has(r.tier) ? tTiers(r.tier) : r.tier.replace('_', ' ')}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Fix-First (choke-point) panel with inline what-if simulation ──
function ChokePanel({ data }: { data: ChokeResult }) {
  const t = useTranslations('graphExplorer')
  const tGate = useTranslations('roleGate')
  const { can } = useAppRole()
  // POST /api/graph/simulate requires analyst
  const canSimulate = can('analyst')
  const [sims, setSims] = useState<Record<number, SimResult | 'loading'>>({})

  const runSim = async (f: ChokeFix) => {
    setSims((s) => ({ ...s, [f.rank]: 'loading' }))
    try {
      const res = await fetch('/api/graph/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeEdge: { source: f.source, target: f.target, label: f.technique } }),
      })
      if (!res.ok) throw new Error('simulate failed')
      const j: SimResult = await res.json()
      setSims((s) => ({ ...s, [f.rank]: j }))
    } catch {
      setSims((s) => { const c = { ...s }; delete c[f.rank]; return c })
    }
  }

  const lastPct = data.fixes[data.fixes.length - 1]?.cumulativePct ?? 0
  const summary = data.fixes.length === 0
    ? (data.summary === 'No Tier 0 assets found' ? t('summaryNoTier0') : t('chokeNothing'))
    : t('chokeSummary', { fixes: data.fixes.length, pct: lastPct, paths: data.totalPaths })

  if (data.fixes.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">{summary}</p>
  }

  return (
    <div className="space-y-2">
      {/* Coverage headline */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2">
        <p className="text-sm text-[var(--text-primary)]">{summary}</p>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--bg-tertiary)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lastPct} aria-label={t('coverage')}>
          <div className="h-full rounded-full bg-[var(--color-critical)]"
            style={{ width: `${data.fixes[data.fixes.length - 1]?.cumulativePct ?? 0}%` }} />
        </div>
      </div>

      {/* Ranked fix list */}
      <div className="space-y-1.5">
        {data.fixes.map((f) => {
          const sim = sims[f.rank]
          return (
            <div key={f.rank} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] p-2.5">
              <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-critical-bg)] text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))] text-xs font-bold flex items-center justify-center">
                  {f.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm text-[var(--text-primary)] flex-wrap">
                    <bdi className="font-medium truncate max-w-[160px]">{f.sourceName}</bdi>
                    <ChevronRight aria-hidden className="w-3.5 h-3.5 text-[var(--text-secondary)] flex-shrink-0 rtl:-scale-x-100" />
                    <bdi className="font-medium truncate max-w-[160px]">{f.targetName}</bdi>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                      <bdi>{f.edgeType.replace(/_/g, ' ')}: {f.technique}</bdi>
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {t('fixImpact', { broken: f.pathsBroken, pct: f.cumulativePct, total: data.totalPaths })}
                  </p>
                </div>
                {canSimulate ? (
                  <button
                    onClick={() => runSim(f)}
                    disabled={sim === 'loading'}
                    className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50">
                    {sim === 'loading' ? <Loader2 aria-hidden className="w-3.5 h-3.5 animate-spin" /> : <Zap aria-hidden className="w-3.5 h-3.5" />}
                    {t('simulate')}
                  </button>
                ) : (
                  <button
                    aria-disabled
                    title={tGate('requiresRole', { role: tGate('roles.analyst') })}
                    className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] opacity-50 cursor-not-allowed">
                    <Zap aria-hidden className="w-3.5 h-3.5" />
                    {t('simulate')}
                  </button>
                )}
              </div>

              {sim && sim !== 'loading' && (
                <div className="mt-2 ms-8 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)] px-2.5 py-1.5">
                  <p className="text-xs text-[var(--text-secondary)]">
                    {t('simResult', { before: sim.before, after: sim.after, broken: sim.pathsBroken, pct: sim.pctReduction })}
                    {sim.capped && <span> · {t('sampled')}</span>}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function GraphExplorer() {
  const t = useTranslations('graphExplorer')
  const tFg = useTranslations('forceGraph')
  const tGate = useTranslations('roleGate')
  const { can } = useAppRole()
  // GET /api/graph/choke-points requires analyst
  const canChoke = can('analyst')
  const [mode, setMode] = useState<'query' | 'path' | 'chokepoints'>('query')
  const [activeQuery, setActiveQuery] = useState<string | null>('paths_to_tier0')
  const [source, setSource] = useState<SearchResult | null>(null)
  const [target, setTarget] = useState<SearchResult | null>(null)
  const [pathParams, setPathParams] = useState<{ s: string; t: string } | null>(null)

  const { data: catalog } = useQuery({ queryKey: ['graph-queries'], queryFn: () => getJSON<{ queries: QueryDef[] }>('/api/graph/queries') })
  const { data: queryResult, isFetching: queryLoading } = useQuery({
    queryKey: ['graph-query', activeQuery],
    queryFn: () => getJSON<GraphResult>(`/api/graph/query?id=${activeQuery}`),
    enabled: mode === 'query' && !!activeQuery,
  })
  const { data: pathResult, isFetching: pathLoading } = useQuery({
    queryKey: ['graph-path', pathParams],
    queryFn: () => getJSON<GraphResult>(`/api/graph/path?source=${pathParams!.s}&target=${pathParams!.t}`),
    enabled: mode === 'path' && !!pathParams,
  })
  const { data: chokeResult, isFetching: chokeLoading } = useQuery({
    queryKey: ['graph-choke'],
    queryFn: () => getJSON<ChokeResult>('/api/graph/choke-points'),
    enabled: mode === 'chokepoints' && canChoke,
  })

  const result: GraphResult | ChokeResult | undefined =
    mode === 'chokepoints' ? chokeResult : mode === 'path' ? pathResult : queryResult
  const loading = mode === 'chokepoints' ? chokeLoading : mode === 'path' ? pathLoading : queryLoading
  const grouped = (catalog?.queries ?? []).reduce<Record<string, QueryDef[]>>((acc, q) => {
    (acc[q.category] ||= []).push(q); return acc
  }, {})

  const tabCls = (active: boolean, border = false) =>
    `px-3 py-1.5 text-sm flex items-center gap-1.5 ${border ? 'border-s border-[var(--border-default)]' : ''} ${
      active ? 'bg-[var(--color-info-bg)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
    }`
  const activeChip = 'border-[var(--color-info)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))] bg-[var(--color-info-bg)]'

  const summaryText = !result ? '' : mode === 'path'
    ? (pathResult?.found ? t('pathFound', { hops: pathResult.hops ?? 0 }) : pathResult?.summary === 'Source or target not found' ? t('pathEndpointMissing') : t('pathNotFound'))
    : querySummary(t, activeQuery, result.summary)

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div role="group" aria-label={t('mode')} className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
          <button onClick={() => setMode('query')} aria-pressed={mode === 'query'} className={tabCls(mode === 'query')}>
            <Network aria-hidden className="w-4 h-4" /> {t('queryLibrary')}
          </button>
          <button onClick={() => setMode('path')} aria-pressed={mode === 'path'} className={tabCls(mode === 'path', true)}>
            <Route aria-hidden className="w-4 h-4" /> {t('pathFinder')}
          </button>
          <button
            onClick={canChoke ? () => setMode('chokepoints') : undefined}
            aria-pressed={mode === 'chokepoints'}
            aria-disabled={!canChoke || undefined}
            title={canChoke ? undefined : tGate('requiresRole', { role: tGate('roles.analyst') })}
            className={`${tabCls(mode === 'chokepoints', true)} aria-disabled:opacity-50 aria-disabled:cursor-not-allowed`}
          >
            <Target aria-hidden className="w-4 h-4" /> {t('fixFirst')}
          </button>
        </div>
        {result && mode !== 'chokepoints' && (
          <span className="text-sm text-[var(--text-secondary)]" aria-live="polite">{loading ? t('running') : summaryText}</span>
        )}
      </div>

      {mode === 'query' && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(grouped).map(([cat, qs]) => (
            <div key={cat} className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] me-0.5">{t.has(`categories.${cat}`) ? t(`categories.${cat}`) : cat}</span>
              {qs.map((q) => (
                <button key={q.id} onClick={() => setActiveQuery(q.id)} title={queryDescription(t, q)} aria-pressed={activeQuery === q.id}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${activeQuery === q.id ? activeChip : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>
                  {queryLabel(t, q)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {mode === 'path' && (
        <div className="flex items-end gap-2 flex-wrap">
          <NodePicker id="gx-source" label={t('fromSource')} value={source} onChange={setSource} />
          <ArrowRight aria-hidden className="w-4 h-4 text-[var(--text-secondary)] mb-2 rtl:-scale-x-100" />
          <NodePicker id="gx-target" label={t('toTarget')} value={target} onChange={setTarget} />
          <button
            disabled={!source || !target}
            onClick={() => source && target && setPathParams({ s: source.id, t: target.id })}
            className="mb-0.5 px-3 py-1.5 text-sm rounded-lg bg-[var(--color-info)] text-white disabled:opacity-40 hover:opacity-90">
            {t('findPath')}
          </button>
        </div>
      )}

      {mode === 'chokepoints' && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {t('fixFirstIntro')}
        </p>
      )}

      {/* Choke-point fix list */}
      {mode === 'chokepoints' && !loading && chokeResult && <ChokePanel data={chokeResult} />}

      {/* Graph */}
      {loading ? (
        <div role="status" className="h-[560px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-secondary)]">
          <Loader2 aria-hidden className="w-5 h-5 animate-spin me-2" /> {t('computing')}
        </div>
      ) : result && result.nodes.length > 0 ? (
        <ForceGraph
          nodes={result.nodes}
          links={result.links}
          colorOf={colorOf}
          height={560}
          filterGroups={[
            { key: 'identity', label: tFg('groups.identity'), color: NODE_COLORS.identity },
            { key: 'group', label: tFg('groups.group'), color: NODE_COLORS.group },
            { key: 'computer', label: tFg('groups.computer'), color: NODE_COLORS.computer },
            { key: 'resource', label: tFg('groups.resource'), color: NODE_COLORS.resource },
            { key: 'gpo', label: tFg('groups.gpo'), color: NODE_COLORS.gpo },
          ]}
        />
      ) : (
        <div className="h-[320px] sm:h-[560px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] flex items-center justify-center text-sm text-[var(--text-secondary)] px-4 text-center">
          {mode === 'path' ? t('pickEndpoints')
            : mode === 'chokepoints' ? t('chokeNothing')
            : t('noResults')}
        </div>
      )}
    </div>
  )
}

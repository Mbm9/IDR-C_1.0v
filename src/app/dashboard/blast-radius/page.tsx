'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { MetricCard } from '@/components/ui/metric-card'
import { BlastRadiusGraph } from '@/components/dashboard/blast-radius-graph'
import type { BlastRadiusGraphProps } from '@/components/dashboard/blast-radius-graph'
import { Search, GitCompare, X } from 'lucide-react'
import { isControlPlaneTier, stricterTier } from '@/lib/utils/tiers'

interface BlastNode {
  id: string
  name: string
  type: 'identity' | 'resource' | 'group'
  subType?: string
  tier?: string
  criticality?: string
}

interface BlastResult {
  center: { id: string; name: string; type: string; subType: string; tier: string; riskScore: number }
  rings: { depth: number; nodes: BlastNode[] }[]
  stats: {
    totalReachable: number
    tierBreaches: number
    criticalAssets: number
    identityCount: number
    resourceCount: number
    groupCount: number
  }
}

interface SearchResult {
  id: string
  displayName: string
  type: string
  adTier: string
}

function computeBlastRadiusScore(stats: BlastResult['stats']): number {
  // Composite score: heavily weighted by T0 reachable and critical assets
  const base = Math.min(stats.totalReachable * 2, 40)
  const t0Weight = Math.min(stats.tierBreaches * 15, 40)
  const critWeight = Math.min(stats.criticalAssets * 5, 20)
  return Math.min(100, base + t0Weight + critWeight)
}

function computeHighestTier(rings: BlastResult['rings']): string {
  let highest = 'tier_2'
  for (const ring of rings) {
    for (const node of ring.nodes) {
      if (node.tier && node.tier !== 'unclassified') highest = stricterTier(node.tier, highest)
    }
  }
  return highest
}

// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const TONE = {
  critical: 'bg-[var(--color-critical-bg)] text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]',
  high: 'bg-[var(--color-high-bg)] text-[color:color-mix(in_srgb,var(--color-high)_60%,var(--text-primary))]',
  medium: 'bg-[var(--color-medium-bg)] text-[color:color-mix(in_srgb,var(--color-medium)_60%,var(--text-primary))]',
  low: 'bg-[var(--color-low-bg)] text-[color:color-mix(in_srgb,var(--color-low)_60%,var(--text-primary))]',
  info: 'bg-[var(--color-info-bg)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))]',
  neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
} as const

function transformToGraphData(data: BlastResult): BlastRadiusGraphProps['data'] {
  const blastScore = computeBlastRadiusScore(data.stats)
  const highestTier = computeHighestTier(data.rings)

  return {
    center: {
      id: data.center.id,
      name: data.center.name,
      type: data.center.type,
      tier: data.center.tier,
      riskScore: data.center.riskScore,
      subType: data.center.subType,
    },
    rings: data.rings.map((ring, idx) => ({
      level: ring.depth,
      label: ring.depth === 1 ? 'Direct' : ring.depth === 2 ? 'Indirect' : 'Transitive',
      nodes: ring.nodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        tier: n.tier,
        subType: n.subType,
        accessType: n.type,
        criticality: n.criticality,
      })),
      edges: [],
    })),
    stats: {
      totalReachable: data.stats.totalReachable,
      t0Reachable: data.stats.tierBreaches,
      blastRadiusScore: blastScore,
      highestTier,
    },
  }
}

export default function BlastRadiusPage() {
  const t = useTranslations('blastRadius')
  const tCommon = useTranslations('common')
  const tTiers = useTranslations('tiers')
  const tId = useTranslations('identity')
  const tEnum = useTranslations('securityEnums')
  const tierLabel = (tier?: string) => (tier ? (tTiers.has(tier) ? tTiers(tier) : tier.replace('_', ' ').toUpperCase()) : tCommon('na'))
  const typeLabel = (type: string, subType?: string) => {
    const main = tEnum.has(`nodeTypes.${type}`) ? tEnum(`nodeTypes.${type}`) : type
    if (!subType) return main
    const sub = tId.has(subType) ? tId(subType)
      : tEnum.has(`resourceTypes.${subType}`) ? tEnum(`resourceTypes.${subType}`)
      : tEnum.has(`groupTypes.${subType}`) ? tEnum(`groupTypes.${subType}`)
      : subType.replace(/_/g, ' ')
    return `${main} / ${sub}`
  }

  // Primary identity
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null)
  const [blastData, setBlastData] = useState<BlastResult | null>(null)
  const [narration, setNarration] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  // Compare mode
  const [compareMode, setCompareMode] = useState(false)
  const [compareSearchQuery, setCompareSearchQuery] = useState('')
  const [compareSearchResults, setCompareSearchResults] = useState<SearchResult[]>([])
  const [compareIdentity, setCompareIdentity] = useState<string | null>(null)
  const [compareBlastData, setCompareBlastData] = useState<BlastResult | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareSearching, setCompareSearching] = useState(false)

  const searchIdentities = useCallback(async (query: string, isCompare: boolean) => {
    if (query.length < 2) {
      if (isCompare) setCompareSearchResults([])
      else setSearchResults([])
      return
    }
    if (isCompare) setCompareSearching(true)
    else setSearching(true)

    try {
      const res = await fetch(`/api/identities?search=${encodeURIComponent(query)}&pageSize=10`)
      if (res.ok) {
        const data = await res.json()
        if (isCompare) setCompareSearchResults(data.data || [])
        else setSearchResults(data.data || [])
      }
    } catch {
      // ignore
    } finally {
      if (isCompare) setCompareSearching(false)
      else setSearching(false)
    }
  }, [])

  const analyzeBlastRadius = useCallback(async (identityId: string, isCompare: boolean) => {
    if (isCompare) {
      setCompareIdentity(identityId)
      setCompareLoading(true)
    } else {
      setSelectedIdentity(identityId)
      setLoading(true)
      setNarration(null)
    }

    try {
      const res = await fetch('/api/blast-radius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId, maxDepth: 3 }),
      })
      if (res.ok) {
        const data = await res.json()
        if (isCompare) {
          setCompareBlastData(data)
        } else {
          setBlastData(data)

          // Get AI narration (primary only)
          try {
            const narRes = await fetch('/api/blast-radius/narrate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            if (narRes.ok) {
              const narData = await narRes.json()
              setNarration(narData.narrative || null)
            }
          } catch {
            // narration optional
          }
        }
      }
    } catch {
      // error handled
    } finally {
      if (isCompare) {
        setCompareLoading(false)
        setCompareSearchResults([])
        setCompareSearchQuery('')
      } else {
        setLoading(false)
        setSearchResults([])
        setSearchQuery('')
      }
    }
  }, [])

  const primaryGraphData = blastData ? transformToGraphData(blastData) : null
  const compareGraphData = compareBlastData ? transformToGraphData(compareBlastData) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <button
          aria-pressed={compareMode}
          onClick={() => {
            setCompareMode(!compareMode)
            if (compareMode) {
              setCompareBlastData(null)
              setCompareIdentity(null)
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-[var(--radius-badge)] border transition-colors text-body font-medium ${
            compareMode
              ? 'bg-[var(--color-info)] text-white border-[var(--color-info)]'
              : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <GitCompare size={16} aria-hidden />
          {compareMode ? t('exitCompare') : t('compareMode')}
        </button>
      </div>

      {/* Search Section */}
      <div className={`grid gap-4 ${compareMode ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Primary Search */}
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <label htmlFor="br-search-a" className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
            {compareMode ? t('identityA') : t('selectIdentity')}
          </label>
          <IdentitySearchInput
            id="br-search-a"
            query={searchQuery}
            results={searchResults}
            searching={searching}
            onChange={(q) => { setSearchQuery(q); searchIdentities(q, false) }}
            onSelect={(id) => analyzeBlastRadius(id, false)}
            placeholder={t('searchPlaceholder')}
          />
        </div>

        {/* Compare Search */}
        {compareMode && (
          <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
            <label htmlFor="br-search-b" className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">{t('identityB')}</label>
            <IdentitySearchInput
              id="br-search-b"
              query={compareSearchQuery}
              results={compareSearchResults}
              searching={compareSearching}
              onChange={(q) => { setCompareSearchQuery(q); searchIdentities(q, true) }}
              onSelect={(id) => analyzeBlastRadius(id, true)}
              placeholder={t('searchSecond')}
            />
          </div>
        )}
      </div>

      {/* Loading */}
      {(loading || compareLoading) && (
        <div role="status" className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-12 text-center">
          <div aria-hidden className="animate-spin h-8 w-8 border-4 border-[var(--color-info)] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">{t('computing')}</p>
        </div>
      )}

      {/* Results */}
      {primaryGraphData && !loading && (
        <>
          {/* Stats row */}
          <div className={`grid gap-4 ${compareMode && compareGraphData ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-4'}`}>
            <MetricCard label={t('totalReachable')} value={primaryGraphData.stats.totalReachable} color="blue" />
            <MetricCard label={t('t0Reachable')} value={primaryGraphData.stats.t0Reachable} color="red" />
            <MetricCard label={t('blastScore')} value={primaryGraphData.stats.blastRadiusScore} color="orange" />
            <MetricCard
              label={t('highestTier')}
              value={tierLabel(primaryGraphData.stats.highestTier)}
              color={isControlPlaneTier(primaryGraphData.stats.highestTier) ? 'red' : 'blue'}
            />
          </div>

          {/* Compare stats */}
          {compareMode && compareGraphData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard label={t('bLabel', { label: t('totalReachable') })} value={compareGraphData.stats.totalReachable} color="blue" />
              <MetricCard label={t('bLabel', { label: t('t0Reachable') })} value={compareGraphData.stats.t0Reachable} color="red" />
              <MetricCard label={t('bLabel', { label: t('blastScore') })} value={compareGraphData.stats.blastRadiusScore} color="orange" />
              <MetricCard
                label={t('bLabel', { label: t('highestTier') })}
                value={tierLabel(compareGraphData.stats.highestTier)}
                color={isControlPlaneTier(compareGraphData.stats.highestTier) ? 'red' : 'blue'}
              />
            </div>
          )}

          {/* Narration */}
          {narration && (
            <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{t('aiAnalysis')}</h3>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-line">{narration}</p>
            </div>
          )}

          {/* Graph(s) */}
          <div className={`grid gap-6 ${compareMode && compareGraphData ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            {/* Primary Graph */}
            <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
              {compareMode && <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{t('identityA')}: <bdi>{primaryGraphData.center.name}</bdi></h3>}
              {!compareMode && <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{t('blastRadiusMap')}</h3>}
              <BlastRadiusGraph data={primaryGraphData} />
            </div>

            {/* Compare Graph */}
            {compareMode && compareGraphData && (
              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{t('identityB')}: <bdi>{compareGraphData.center.name}</bdi></h3>
                <BlastRadiusGraph data={compareGraphData} />
              </div>
            )}
          </div>

          {/* Ring details */}
          {blastData && blastData.rings.map((ring) => (
            <div key={ring.depth} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                {t('ringDepth', { depth: ring.depth })} ({t('nodesCount', { count: ring.nodes.length })})
              </h3>
              <div tabIndex={0} role="region" aria-label={t('ringDepth', { depth: ring.depth })} className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)]">
                      <th className="text-start py-2 px-3 text-[var(--text-secondary)] font-medium">{t('name')}</th>
                      <th className="text-start py-2 px-3 text-[var(--text-secondary)] font-medium">{t('type')}</th>
                      <th className="text-start py-2 px-3 text-[var(--text-secondary)] font-medium">{t('tier')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ring.nodes.slice(0, 20).map((node) => (
                      <tr key={node.id} className="border-b border-[var(--border-default)]">
                        <td className="py-2 px-3 text-[var(--text-primary)]"><bdi>{node.name}</bdi></td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            node.type === 'identity' ? TONE.info : node.type === 'resource' ? TONE.neutral : TONE.medium
                          }`}>
                            {typeLabel(node.type, node.subType)}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {node.tier && node.tier !== 'unclassified' && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                              isControlPlaneTier(node.tier) ? TONE.critical : node.tier === 'tier_1' ? TONE.high : TONE.low
                            }`}>
                              {tierLabel(node.tier)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ring.nodes.length > 20 && (
                  <p className="text-xs text-[var(--text-secondary)] mt-2 px-3">
                    {t('moreNodesCount', { count: ring.nodes.length - 20 })}
                  </p>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Reusable search input ──

function IdentitySearchInput({
  id,
  query,
  results,
  searching,
  onChange,
  onSelect,
  placeholder,
}: {
  id: string
  query: string
  results: SearchResult[]
  searching: boolean
  onChange: (query: string) => void
  onSelect: (id: string) => void
  placeholder: string
}) {
  const tId = useTranslations('identity')
  const tTiers = useTranslations('tiers')
  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} aria-hidden className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full ps-9 pe-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)]"
        />
        {searching && (
          <div className="absolute end-3 top-1/2 -translate-y-1/2">
            <div aria-hidden className="w-4 h-4 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute top-full start-0 end-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
          {results.map((identity) => (
            <button
              key={identity.id}
              onClick={() => onSelect(identity.id)}
              className="w-full text-start px-4 py-2 hover:bg-[var(--bg-secondary)] text-sm flex items-center justify-between gap-2"
            >
              <bdi className="text-[var(--text-primary)] truncate">{identity.displayName}</bdi>
              <span className="text-xs text-[var(--text-secondary)] shrink-0">
                {tId.has(identity.type) ? tId(identity.type) : identity.type}
                {identity.adTier ? ` / ${tTiers.has(identity.adTier) ? tTiers(identity.adTier) : identity.adTier.replace('_', ' ')}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  GraphLegend,
  BLAST_RADIUS_LEGEND_NODES,
  BLAST_RADIUS_LEGEND_EDGES,
  TIER_COLORS,
} from './graph-legend'
import { ForceGraph, riskForTier, type FgNode, type FgLink } from './force-graph'
import { isControlPlaneTier } from '@/lib/utils/tiers'

// ── Types (unchanged public API) ──

export interface BlastRadiusNode {
  id: string
  name: string
  type: 'identity' | 'resource' | 'group'
  subType?: string
  tier?: string
  accessType?: string
  criticality?: string
}

export interface BlastRadiusEdge {
  source: string
  target: string
  label: string
  accessType: string
}

export interface BlastRadiusRing {
  level: number
  label: string
  nodes: BlastRadiusNode[]
  edges?: BlastRadiusEdge[]
}

export interface BlastRadiusCenter {
  id: string
  name: string
  type: string
  tier: string
  riskScore: number
  subType?: string
}

export interface BlastRadiusStats {
  totalReachable: number
  t0Reachable: number
  blastRadiusScore: number
  highestTier: string
}

export interface BlastRadiusGraphProps {
  data: {
    center: BlastRadiusCenter
    rings: BlastRadiusRing[]
    stats: BlastRadiusStats
  }
  width?: number
  height?: number
  onNodeClick?: (node: BlastRadiusNode) => void
  className?: string
}

// ── Colours ──

const BR_COLORS: Record<string, string> = {
  center: '#DC2626',
  identity: '#2563EB',
  resource: '#5F6B7A',
  group: '#CA8A04',
  unknown: '#94a3b8',
}
const BR_COLOR_OF = (group: string) => BR_COLORS[group] ?? BR_COLORS.unknown

const ADMIN_ACCESS = ['admin', 'owner', 'full_control', 'write', 'genericall']

// ── Component (force-directed + draggable via the shared engine) ──

export function BlastRadiusGraph({ data, height = 580, onNodeClick, className = '' }: BlastRadiusGraphProps) {
  const t = useTranslations('forceGraph')
  const tBr = useTranslations('blastRadius')
  const { nodes, links, originalById } = useMemo(() => {
    if (!data) return { nodes: [] as FgNode[], links: [] as FgLink[], originalById: new Map<string, BlastRadiusNode>() }
    const nMap = new Map<string, FgNode>()
    const originalById = new Map<string, BlastRadiusNode>()
    const links: FgLink[] = []
    const linkSet = new Set<string>()

    // Center (compromised identity)
    nMap.set(data.center.id, {
      id: data.center.id, label: data.center.name, group: 'center',
      tier: data.center.tier, riskScore: Math.max(80, data.center.riskScore || 80),
      severity: 'critical', badge: '◎',
      meta: { type: data.center.type, role: 'center' },
    })

    for (const ring of data.rings) {
      for (const node of ring.nodes) {
        if (!nMap.has(node.id)) {
          nMap.set(node.id, {
            id: node.id, label: node.name, group: node.type,
            tier: node.tier, riskScore: riskForTier(node.tier),
            severity: isControlPlaneTier(node.tier) ? 'critical' : node.tier === 'tier_1' ? 'high' : undefined,
            meta: {
              type: node.type,
              ...(node.accessType ? { access: node.accessType } : {}),
              ...(node.criticality ? { criticality: node.criticality } : {}),
              hop: ring.level,
            },
          })
          originalById.set(node.id, node)
        }
        // reachability edge from the compromised origin
        const key = `${data.center.id}|${node.id}`
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: data.center.id, target: node.id, dangerous: isControlPlaneTier(node.tier) })
        }
      }
      // lateral edges within the ring, if provided
      for (const e of ring.edges ?? []) {
        const key = `${e.source}|${e.target}`
        if (linkSet.has(key)) continue
        linkSet.add(key)
        links.push({
          source: e.source, target: e.target, label: e.label,
          dangerous: ADMIN_ACCESS.some((a) => (e.accessType || '').toLowerCase().includes(a)),
        })
      }
    }
    return { nodes: Array.from(nMap.values()), links, originalById }
  }, [data])

  if (!data) {
    return (
      <div className={`flex items-center justify-center h-96 text-[var(--text-secondary)] ${className}`}>
        {tBr('selectToVisualize')}
      </div>
    )
  }

  return (
    <div className={`relative w-full space-y-3 ${className}`}>
      <ForceGraph
        nodes={nodes}
        links={links}
        colorOf={BR_COLOR_OF}
        height={height}
        searchPlaceholder={tBr('searchReachable')}
        ariaLabel={tBr('graphAria', { name: data.center.name, count: Math.max(0, nodes.length - 1) })}
        onSelect={(n) => { if (n && onNodeClick) { const orig = originalById.get(n.id); if (orig) onNodeClick(orig) } }}
        filterGroups={[
          { key: 'identity', label: t('groups.identity'), color: BR_COLORS.identity },
          { key: 'resource', label: t('groups.resource'), color: BR_COLORS.resource },
          { key: 'group', label: t('groups.group'), color: BR_COLORS.group },
        ]}
      />
      <GraphLegend
        title="blastRadiusLegend"
        nodes={BLAST_RADIUS_LEGEND_NODES}
        edges={BLAST_RADIUS_LEGEND_EDGES}
        tiers={TIER_COLORS}
        defaultCollapsed
      />
    </div>
  )
}

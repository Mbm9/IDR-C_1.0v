'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  GraphLegend,
  ATTACK_PATH_LEGEND_NODES,
  ATTACK_PATH_LEGEND_EDGES,
  TIER_COLORS,
} from './graph-legend'
import { ForceGraph, riskForTier, type FgNode, type FgLink } from './force-graph'
import { isControlPlaneTier } from '@/lib/utils/tiers'

// ── Types (unchanged public API) ──

export interface AttackPathNode {
  id: string
  name: string
  type: string // 'identity', 'group', 'resource', 'computer', 'domain', 'ou'
  tier?: string
  riskScore?: number
  subType?: string
}

export interface AttackPathEdge {
  source: string
  target: string
  technique: string
  label?: string
  mitreId?: string
  type?: string
  exploitability?: 'trivial' | 'moderate' | 'advanced'
  confirmed?: boolean
}

export interface AttackPathData {
  id: string
  pathNodes: AttackPathNode[]
  pathEdges: AttackPathEdge[]
  riskScore: number
}

export interface AttackPathGraphProps {
  paths: AttackPathData[]
  width?: number
  height?: number
  onNodeClick?: (node: AttackPathNode) => void
  onEdgeClick?: (edge: AttackPathEdge) => void
  highlightPathId?: string
  className?: string
}

// ── Colours ──

const NODE_COLORS: Record<string, string> = {
  identity_human: '#2563EB',
  identity_non_human: '#7C3AED',
  resource: '#5F6B7A',
  computer: '#4F46E5',
  group: '#CA8A04',
  domain: '#DC2626',
  ou: '#7C3AED',
  unknown: '#94a3b8',
}
const AP_COLOR_OF = (group: string) => NODE_COLORS[group] ?? NODE_COLORS.unknown

const TECHNIQUE_DANGER: Record<string, 'high' | 'medium' | 'low'> = {
  GenericAll: 'high', WriteDACL: 'high', WriteOwner: 'high', DCSync: 'high', ACLAbuse: 'high',
  ForceChangePassword: 'medium', AddMember: 'medium', Delegation: 'medium',
  GroupMembership: 'low', Entitlement: 'low', OwnerOf: 'low',
}

const NHI_SUBTYPES = ['service_account', 'managed_identity', 'app_registration', 'api_key', 'bot', 'machine', 'certificate']

function groupOf(node: AttackPathNode): string {
  if (node.type === 'identity') {
    return node.subType && NHI_SUBTYPES.includes(node.subType) ? 'identity_non_human' : 'identity_human'
  }
  return NODE_COLORS[node.type] ? node.type : 'unknown'
}

// ── Component (now force-directed + draggable via the shared engine) ──

export function AttackPathGraph({ paths, height = 560, onNodeClick, className = '' }: AttackPathGraphProps) {
  const t = useTranslations('forceGraph')
  const tAp = useTranslations('attackPaths')
  const { nodes, links, originalById } = useMemo(() => {
    const nMap = new Map<string, FgNode>()
    const originalById = new Map<string, AttackPathNode>()
    const linkSet = new Set<string>()
    const links: FgLink[] = []

    for (const path of paths) {
      for (const node of path.pathNodes) {
        if (!nMap.has(node.id)) {
          nMap.set(node.id, {
            id: node.id,
            label: node.name,
            group: groupOf(node),
            tier: node.tier,
            riskScore: node.riskScore ?? riskForTier(node.tier),
            severity: isControlPlaneTier(node.tier) ? 'critical' : undefined,
            meta: { type: node.type, ...(node.subType ? { subType: node.subType } : {}) },
          })
          originalById.set(node.id, node)
        }
      }
      for (const e of path.pathEdges) {
        const key = `${e.source}|${e.target}|${e.technique}`
        if (linkSet.has(key)) continue
        linkSet.add(key)
        links.push({
          source: e.source, target: e.target,
          type: e.technique, label: e.label || e.technique,
          dangerous: TECHNIQUE_DANGER[e.technique] === 'high' || e.exploitability === 'trivial',
        })
      }
    }
    return { nodes: Array.from(nMap.values()), links, originalById }
  }, [paths])

  return (
    <div className={`relative w-full space-y-3 ${className}`}>
      <ForceGraph
        nodes={nodes}
        links={links}
        colorOf={AP_COLOR_OF}
        height={height}
        ariaLabel={tAp('graphAria', { nodes: nodes.length, edges: links.length })}
        onSelect={(n) => { if (n && onNodeClick) { const orig = originalById.get(n.id); if (orig) onNodeClick(orig) } }}
        filterGroups={[
          { key: 'identity_human', label: t('groups.identity_human'), color: NODE_COLORS.identity_human },
          { key: 'identity_non_human', label: t('groups.identity_non_human'), color: NODE_COLORS.identity_non_human },
          { key: 'group', label: t('groups.group'), color: NODE_COLORS.group },
          { key: 'resource', label: t('groups.resource'), color: NODE_COLORS.resource },
          { key: 'computer', label: t('groups.computer'), color: NODE_COLORS.computer },
        ]}
      />
      <GraphLegend
        title="attackPathLegend"
        nodes={ATTACK_PATH_LEGEND_NODES}
        edges={ATTACK_PATH_LEGEND_EDGES}
        tiers={TIER_COLORS}
        defaultCollapsed
      />
    </div>
  )
}

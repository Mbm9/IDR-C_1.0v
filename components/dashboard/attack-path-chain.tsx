'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

// Reuse color constants from identity-graph
const NODE_COLORS: Record<string, string> = {
  identity: '#2563EB',
  resource: '#5F6B7A',
  group: '#CA8A04',
  ou: '#7C3AED',
  domain: '#DC2626',
  computer: '#4F46E5',
  gpo: '#059669',
  unknown: '#94a3b8',
}

const TIER_RING: Record<string, string> = {
  tier_0: '#DC2626',
  tier_top: '#BE123C',
  tier_1: '#EA580C',
  tier_2: '#5F6B7A',
}

const TECHNIQUE_COLORS: Record<string, string> = {
  GenericAll: '#DC2626',
  WriteDACL: '#EA580C',
  WriteOwner: '#EA580C',
  DCSync: '#DC2626',
  AddMember: '#D97706',
  ForceChangePassword: '#D97706',
  GroupMembership: '#CA8A04',
  Entitlement: '#2563EB',
  OwnerOf: '#7C3AED',
  Delegation: '#EA580C',
  ACLAbuse: '#DC2626',
}

interface PathNode {
  id: string
  type: string
  name: string
  tier?: string
}

interface PathEdge {
  source: string
  target: string
  type: string
  label: string
  technique: string
}

interface AttackPathChainProps {
  pathNodes: PathNode[]
  pathEdges: PathEdge[]
  width?: number
  height?: number
}

export function AttackPathChain({
  pathNodes,
  pathEdges,
  width = 900,
  height = 200,
}: AttackPathChainProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  useEffect(() => {
    if (!svgRef.current || pathNodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const nodeRadius = 24
    const padding = 60
    const usableWidth = width - padding * 2
    const spacing = usableWidth / Math.max(pathNodes.length - 1, 1)
    const centerY = height / 2

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    // Defs: arrow markers
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'chain-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', nodeRadius + 8)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#94a3b8')
      .attr('d', 'M0,-5L10,0L0,5')

    // Position nodes horizontally
    const nodePositions = pathNodes.map((n, i) => ({
      ...n,
      x: padding + i * spacing,
      y: centerY,
    }))

    // Draw edges
    for (let i = 0; i < pathEdges.length; i++) {
      const edge = pathEdges[i]
      const from = nodePositions[i]
      const to = nodePositions[i + 1]
      if (!from || !to) continue

      const techniqueColor = TECHNIQUE_COLORS[edge.technique] || '#94a3b8'

      // Edge line
      g.append('line')
        .attr('x1', from.x + nodeRadius + 4)
        .attr('y1', from.y)
        .attr('x2', to.x - nodeRadius - 4)
        .attr('y2', to.y)
        .attr('stroke', techniqueColor)
        .attr('stroke-width', 2.5)
        .attr('marker-end', 'url(#chain-arrow)')
        .attr('opacity', 0.8)
        .on('mouseenter', function (event) {
          setTooltip({
            x: event.pageX,
            y: event.pageY,
            content: `${edge.technique}: ${edge.label}`,
          })
          d3.select(this).attr('stroke-width', 4).attr('opacity', 1)
        })
        .on('mouseleave', function () {
          setTooltip(null)
          d3.select(this).attr('stroke-width', 2.5).attr('opacity', 0.8)
        })

      // Edge technique label
      const midX = (from.x + to.x) / 2
      const midY = (from.y + to.y) / 2

      g.append('rect')
        .attr('x', midX - 40)
        .attr('y', midY - 22)
        .attr('width', 80)
        .attr('height', 16)
        .attr('rx', 3)
        .attr('fill', techniqueColor)
        .attr('opacity', 0.15)

      g.append('text')
        .text(edge.technique.length > 14 ? edge.technique.slice(0, 14) + '..' : edge.technique)
        .attr('x', midX)
        .attr('y', midY - 12)
        .attr('text-anchor', 'middle')
        .attr('fill', techniqueColor)
        .attr('font-size', '9px')
        .attr('font-weight', '600')
        .attr('pointer-events', 'none')
    }

    // Draw nodes
    for (const node of nodePositions) {
      const el = g.append('g')
        .attr('transform', `translate(${node.x}, ${node.y})`)
        .attr('cursor', 'pointer')

      const color = NODE_COLORS[node.type] || NODE_COLORS.unknown
      const tierColor = TIER_RING[node.tier || '']

      // Tier ring
      if (tierColor) {
        el.append('circle')
          .attr('r', nodeRadius + 3)
          .attr('fill', 'none')
          .attr('stroke', tierColor)
          .attr('stroke-width', 2.5)
      }

      // Node shape
      if (node.type === 'identity') {
        el.append('circle')
          .attr('r', nodeRadius)
          .attr('fill', color)
          .attr('stroke', tierColor || '#1e293b')
          .attr('stroke-width', 1.5)
      } else if (node.type === 'resource' || node.type === 'computer') {
        const s = nodeRadius * 1.6
        el.append('rect')
          .attr('x', -s / 2).attr('y', -s / 2)
          .attr('width', s).attr('height', s)
          .attr('rx', 3)
          .attr('fill', color)
      } else if (node.type === 'group') {
        const s = nodeRadius * 1.4
        el.append('rect')
          .attr('x', -s / 2).attr('y', -s / 2)
          .attr('width', s).attr('height', s)
          .attr('rx', 2)
          .attr('fill', color)
          .attr('transform', 'rotate(45)')
      } else {
        el.append('circle')
          .attr('r', nodeRadius)
          .attr('fill', color)
      }

      // Node label (below)
      el.append('text')
        .text(node.name.length > 18 ? node.name.slice(0, 18) + '..' : node.name)
        .attr('y', nodeRadius + 16)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .attr('pointer-events', 'none')

      // Tier badge (above)
      if (node.tier) {
        el.append('text')
          .text(node.tier === 'tier_top' ? 'TOP TIER' : node.tier.replace('_', ' ').toUpperCase())
          .attr('y', -(nodeRadius + 8))
          .attr('text-anchor', 'middle')
          .attr('fill', tierColor || 'var(--text-tertiary)')
          .attr('font-size', '8px')
          .attr('font-weight', '700')
          .attr('pointer-events', 'none')
      }

      // Type icon text
      const icon = node.type === 'identity' ? '\u{1F464}' : node.type === 'group' ? '\u{1F465}' : node.type === 'resource' ? '\u{1F4BB}' : '\u{1F512}'
      el.append('text')
        .text(icon)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', '14px')
        .attr('pointer-events', 'none')

      // Hover
      el.on('mouseenter', function (event) {
        setTooltip({
          x: event.pageX,
          y: event.pageY,
          content: `${node.name}\nType: ${node.type}${node.tier ? `\nTier: ${node.tier}` : ''}`,
        })
      })
      el.on('mouseleave', function () {
        setTooltip(null)
      })
    }
  }, [pathNodes, pathEdges, width, height])

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]"
        style={{ boxShadow: 'var(--shadow-card)' }}
      />
      {tooltip && (
        <div
          className="fixed z-50 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-2 text-caption pointer-events-none whitespace-pre-line max-w-[240px]"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12, boxShadow: 'var(--shadow-dropdown)' }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}

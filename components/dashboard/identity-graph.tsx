'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { useTranslations } from 'next-intl'
import { isControlPlaneTier } from '@/lib/utils/tiers'

// ── Types ──

export interface GraphNode {
  id: string
  label: string
  type: 'identity' | 'resource' | 'group' | 'violation' | 'account' | 'gpo'
  subType?: string
  tier?: string
  riskScore?: number
  tierViolation?: boolean
  identityType?: string
  isPrivileged?: boolean
  properties?: Record<string, any>
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: 'entitlement' | 'membership' | 'manager' | 'owner' | 'violation' | 'account' | 'gpo_link' | 'gpo_edit'
  label?: string
  properties?: Record<string, any>
}

export type GraphLayout = 'force' | 'hierarchical' | 'radial'

interface IdentityGraphProps {
  nodes: GraphNode[]
  links: GraphLink[]
  width?: number
  height?: number
  layout?: GraphLayout
  onNodeClick?: (node: GraphNode) => void
  onNodeDoubleClick?: (node: GraphNode) => void
  onNodeRightClick?: (node: GraphNode, x: number, y: number) => void
  onEdgeHover?: (link: GraphLink | null, x: number, y: number) => void
  visibleEdgeTypes?: string[]
}

// Above this many nodes only key labels are drawn (Tier 0/Top Tier, tier violations, the
// hovered node and its neighbours) so names don't pile on top of each other.
const DENSE_LABEL_THRESHOLD = 30

// ── Constants ──

const NODE_COLORS: Record<string, string> = {
  identity_human: '#2563EB',
  identity_non_human: '#7C3AED',
  resource: '#5F6B7A',
  group: '#CA8A04',
  violation: '#DC2626',
  account: '#4F46E5',
  gpo: '#0891B2',
}

const TIER_RING: Record<string, string> = {
  tier_0: '#DC2626',
  tier_top: '#BE123C',
  tier_1: '#EA580C',
  tier_2: '#5F6B7A',
}

const EDGE_STYLES: Record<string, { stroke: string; dasharray: string; width: number }> = {
  entitlement: { stroke: '#94a3b8', dasharray: 'none', width: 1 },
  membership: { stroke: '#cbd5e1', dasharray: '4,4', width: 0.8 },
  manager: { stroke: '#3B82F6', dasharray: '6,3', width: 1.5 },
  owner: { stroke: '#8B5CF6', dasharray: '6,3', width: 1.5 },
  violation: { stroke: '#DC2626', dasharray: 'none', width: 2 },
  account: { stroke: '#4F46E5', dasharray: '3,3', width: 1 },
  gpo_link: { stroke: '#0891B2', dasharray: '5,3', width: 1.2 },
  gpo_edit: { stroke: '#DC2626', dasharray: 'none', width: 1.5 },
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high: '#EA580C',
  medium: '#D97706',
  low: '#5F6B7A',
}

// ── Helper: tier to Y position for hierarchical layout ──

function tierToY(tier: string | undefined, height: number): number {
  const padding = 60
  const usable = height - padding * 2
  switch (tier) {
    case 'tier_0': return padding
    case 'tier_top': return padding + usable * 0.2
    case 'tier_1': return padding + usable * 0.4
    case 'tier_2': return padding + usable * 0.65
    default: return padding + usable * 0.9
  }
}

// ── Component ──

export function IdentityGraph({
  nodes,
  links,
  width: widthProp,
  height = 600,
  layout = 'force',
  onNodeClick,
  onNodeDoubleClick,
  onNodeRightClick,
  onEdgeHover,
  visibleEdgeTypes,
}: IdentityGraphProps) {
  const t = useTranslations('identityGraph')
  const tTiers = useTranslations('tiers')
  const tSev = useTranslations('severity')
  const tEnum = useTranslations('securityEnums')
  const tId = useTranslations('identity')
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null)
  const [legendOpen, setLegendOpen] = useState(true)
  // Track the container width so the canvas fits any viewport (no horizontal scroll at 390px).
  const [measured, setMeasured] = useState<number | null>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 0) setMeasured((prev) => (prev === w ? prev : w))
    })
    ro.observe(el)
    if (el.clientWidth < 640) setLegendOpen(false)
    return () => ro.disconnect()
  }, [])
  const width = measured ?? widthProp ?? 900
  const dense = nodes.length > DENSE_LABEL_THRESHOLD
  const edgeLabelText = { manager: t('edgeManages'), owner: t('edgeOwns') }
  const edgeLabelKey = `${edgeLabelText.manager}|${edgeLabelText.owner}`

  const getNodeRadius = useCallback((d: GraphNode) => {
    if (d.type === 'identity') return Math.max(8, Math.min(22, (d.riskScore || 10) / 4))
    if (d.type === 'violation') return 7
    if (d.type === 'account') return 6
    return 6
  }, [])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Filter links by visible edge types
    const filteredLinks = visibleEdgeTypes
      ? links.filter(l => visibleEdgeTypes.includes(l.type))
      : links

    // ── Defs (arrows, filters, animations) ──
    const defs = svg.append('defs')

    // Arrow markers
    const markerTypes = [
      { id: 'arrow-manager', color: '#3B82F6' },
      { id: 'arrow-owner', color: '#8B5CF6' },
      { id: 'arrow-violation', color: '#DC2626' },
      { id: 'arrow-account', color: '#4F46E5' },
    ]
    for (const m of markerTypes) {
      defs.append('marker')
        .attr('id', m.id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', m.color)
        .attr('d', 'M0,-5L10,0L0,5')
    }

    // Glow filter for critical violations
    const glowFilter = defs.append('filter')
      .attr('id', 'glow-critical')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%')
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'blur')
    glowFilter.append('feFlood')
      .attr('flood-color', '#DC2626')
      .attr('flood-opacity', '0.6')
      .attr('result', 'color')
    glowFilter.append('feComposite')
      .attr('in', 'color')
      .attr('in2', 'blur')
      .attr('operator', 'in')
      .attr('result', 'shadow')
    const glowMerge = glowFilter.append('feMerge')
    glowMerge.append('feMergeNode').attr('in', 'shadow')
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Pulse animation style
    svg.append('style').text(`
      @keyframes graphPulse {
        0%, 100% { transform: scale(1); opacity: 0.6; }
        50% { transform: scale(1.25); opacity: 0.15; }
      }
      .graph-pulse-ring {
        transform-box: fill-box;
        transform-origin: center;
        animation: graphPulse 2s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .graph-pulse-ring { animation: none; }
      }
    `)

    const g = svg.append('g')

    // Zoom
    // userMoved: the person zoomed or panned, so don't re-fit the view under them
    let userMoved = false
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        if (event.sourceEvent) userMoved = true
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Clone nodes to avoid mutating props
    const simNodes = nodes.map(n => ({ ...n })) as GraphNode[]
    const simLinks = filteredLinks.map(l => ({ ...l }))

    // ── Layout Initialization ──
    if (layout === 'hierarchical') {
      // Group nodes by tier for identity nodes, position non-identity near connected identity
      const identityNodes = simNodes.filter(n => n.type === 'identity')
      const tierGroups: Record<string, GraphNode[]> = {}
      for (const n of identityNodes) {
        const key = n.tier || 'unclassified'
        if (!tierGroups[key]) tierGroups[key] = []
        tierGroups[key].push(n)
      }
      for (const [tier, group] of Object.entries(tierGroups)) {
        const y = tierToY(tier, height)
        group.forEach((n, i) => {
          const spacing = width / (group.length + 1)
          n.x = spacing * (i + 1)
          n.y = y
          n.fx = n.x
          n.fy = n.y
        })
      }
      // Position non-identity nodes near their connected identity
      const identityIdSet = new Set(identityNodes.map(n => n.id))
      for (const n of simNodes) {
        if (identityIdSet.has(n.id)) continue
        const connectedLink = simLinks.find(l => {
          const sid = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
          const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
          return sid === n.id || tid === n.id
        })
        if (connectedLink) {
          const sid = typeof connectedLink.source === 'string' ? connectedLink.source : (connectedLink.source as GraphNode).id
          const tid = typeof connectedLink.target === 'string' ? connectedLink.target : (connectedLink.target as GraphNode).id
          const connectedId = sid === n.id ? tid : sid
          const connectedNode = simNodes.find(cn => cn.id === connectedId)
          if (connectedNode && connectedNode.x !== undefined && connectedNode.y !== undefined) {
            n.x = connectedNode.x + (Math.random() - 0.5) * 60
            n.y = connectedNode.y + 30 + Math.random() * 20
          }
        }
      }
    } else if (layout === 'radial') {
      // Radial: high risk at center
      const sorted = [...simNodes].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      const cx = width / 2
      const cy = height / 2
      const maxRadius = Math.min(width, height) / 2 - 40
      sorted.forEach((n, i) => {
        if (i === 0) {
          n.x = cx
          n.y = cy
        } else {
          const risk = n.riskScore || 0
          const ringDist = maxRadius * (1 - risk / 100) * 0.8 + maxRadius * 0.2
          const angle = (i / sorted.length) * 2 * Math.PI
          n.x = cx + ringDist * Math.cos(angle)
          n.y = cy + ringDist * Math.sin(angle)
        }
      })
    }

    // ── Simulation ──
    const simulation = d3.forceSimulation<GraphNode>(simNodes)
      .force('link', d3.forceLink<GraphNode, any>(simLinks as any[]).id((d: any) => d.id).distance(layout === 'force' ? 80 : 50))
      .force('charge', d3.forceManyBody().strength(layout === 'force' ? -200 : -50))
      .force('center', layout === 'force' ? d3.forceCenter(width / 2, height / 2) : null)
      // Weak pull to the middle: without it, unconnected nodes are pushed thousands of px away by the charge
      .force('x', layout === 'force' ? d3.forceX(width / 2).strength(0.06) : null)
      .force('y', layout === 'force' ? d3.forceY(height / 2).strength(0.06 * width / height) : null)
      .force('collision', d3.forceCollide().radius((d: any) => getNodeRadius(d) + 5))

    if (layout !== 'force') {
      simulation.alpha(0.3).alphaDecay(0.05)
    }

    // ── Links ──
    const linkGroup = g.append('g').attr('class', 'links')
    const link = linkGroup
      .selectAll<SVGLineElement, typeof simLinks[0]>('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', d => EDGE_STYLES[d.type]?.stroke || '#94a3b8')
      .attr('stroke-width', d => EDGE_STYLES[d.type]?.width || 1)
      .attr('stroke-dasharray', d => EDGE_STYLES[d.type]?.dasharray || 'none')
      .attr('opacity', 0.5)
      .attr('data-link-type', d => d.type)
      .attr('marker-end', d => {
        if (d.type === 'manager') return 'url(#arrow-manager)'
        if (d.type === 'owner') return 'url(#arrow-owner)'
        if (d.type === 'violation') return 'url(#arrow-violation)'
        if (d.type === 'account') return 'url(#arrow-account)'
        if (d.type === 'gpo_link') return 'url(#arrow-gpo-link)'
        if (d.type === 'gpo_edit') return 'url(#arrow-gpo-edit)'
        return null
      })

    // Edge hover interaction
    link
      .on('mouseenter', function (event, d) {
        if (onEdgeHover) {
          onEdgeHover(d as GraphLink, event.clientX, event.clientY)
        }
        d3.select(this)
          .attr('stroke-width', (EDGE_STYLES[d.type]?.width || 1) * 2.5)
          .attr('opacity', 1)
      })
      .on('mouseleave', function (_event, d) {
        if (onEdgeHover) {
          onEdgeHover(null, 0, 0)
        }
        d3.select(this)
          .attr('stroke-width', EDGE_STYLES[d.type]?.width || 1)
          .attr('opacity', 0.5)
      })

    // Edge labels for manager/owner
    const edgeLabelLinks = simLinks.filter(l => l.type === 'manager' || l.type === 'owner')
    const edgeLabels = g.append('g')
      .selectAll('text')
      .data(edgeLabelLinks)
      .enter()
      .append('text')
      .text((d: any) => (d.type === 'manager' ? edgeLabelText.manager : edgeLabelText.owner))
      .attr('opacity', dense ? 0 : 1)
      .attr('text-anchor', 'middle')
      .attr('fill', (d: any) => d.type === 'manager' ? '#3B82F6' : '#8B5CF6')
      .attr('font-size', '9px')
      .attr('font-weight', '500')
      .attr('pointer-events', 'none')
      .attr('dy', -4)

    // ── Nodes ──
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const node = nodeGroup
      .selectAll<SVGGElement, GraphNode>('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .attr('data-node-id', d => d.id)
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          if (layout === 'force') {
            d.fx = null
            d.fy = null
          }
        })
      )

    // Arrow markers for GPO edges
    defs.append('marker')
      .attr('id', 'arrow-gpo-link')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#0891B2')
      .attr('d', 'M0,-5L10,0L0,5')

    defs.append('marker')
      .attr('id', 'arrow-gpo-edit')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#DC2626')
      .attr('d', 'M0,-5L10,0L0,5')

    // Draw node shapes
    node.each(function (d) {
      const el = d3.select(this)
      const nodeType = d.type === 'identity' ? `identity_${d.identityType}` : d.type
      const color = NODE_COLORS[nodeType] || NODE_COLORS.resource
      const radius = getNodeRadius(d)

      if (d.type === 'identity') {
        // Pulse ring for tier violations
        if (d.tierViolation) {
          el.append('circle')
            .attr('r', radius + 4)
            .attr('fill', 'none')
            .attr('stroke', '#DC2626')
            .attr('stroke-width', 2)
            .attr('opacity', 0.6)
            .attr('class', 'graph-pulse-ring')
        }
        el.append('circle')
          .attr('r', radius)
          .attr('fill', color)
          .attr('stroke', d.tierViolation ? '#DC2626' : (TIER_RING[d.tier || ''] || 'none'))
          .attr('stroke-width', d.tierViolation ? 3 : 1.5)
      } else if (d.type === 'resource') {
        const s = radius * 1.6
        el.append('rect')
          .attr('x', -s / 2).attr('y', -s / 2)
          .attr('width', s).attr('height', s)
          .attr('rx', 2)
          .attr('fill', TIER_RING[d.tier || ''] || color)
          .attr('opacity', 0.85)
      } else if (d.type === 'group') {
        const s = radius * 1.6
        el.append('rect')
          .attr('x', -s / 2).attr('y', -s / 2)
          .attr('width', s).attr('height', s)
          .attr('rx', 1)
          .attr('fill', d.isPrivileged ? '#DC2626' : '#CA8A04')
          .attr('opacity', 0.85)
          .attr('transform', 'rotate(45)')
      } else if (d.type === 'violation') {
        // Triangle for violations
        const severity = d.properties?.severity || 'medium'
        const vColor = SEVERITY_COLORS[severity] || SEVERITY_COLORS.medium
        const s = radius * 1.8
        const trianglePath = `M0,${-s * 0.7} L${s * 0.6},${s * 0.4} L${-s * 0.6},${s * 0.4} Z`
        el.append('path')
          .attr('d', trianglePath)
          .attr('fill', vColor)
          .attr('opacity', 0.9)
        if (severity === 'critical') {
          el.attr('filter', 'url(#glow-critical)')
        }
        // Exclamation mark
        el.append('text')
          .text('!')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.2em')
          .attr('fill', '#fff')
          .attr('font-size', `${Math.max(8, s * 0.6)}px`)
          .attr('font-weight', 'bold')
          .attr('pointer-events', 'none')
      } else if (d.type === 'account') {
        // Hexagon for accounts
        const s = radius * 1.3
        const hex = d3.range(6).map(i => {
          const angle = (i * 60 - 30) * Math.PI / 180
          return `${s * Math.cos(angle)},${s * Math.sin(angle)}`
        }).join(' ')
        el.append('polygon')
          .attr('points', hex)
          .attr('fill', d.properties?.privileged ? '#7C3AED' : '#4F46E5')
          .attr('opacity', 0.85)
      } else if (d.type === 'gpo') {
        // Rounded rectangle (pentagon-like) for GPO
        const s = radius * 1.5
        el.append('rect')
          .attr('x', -s / 2).attr('y', -s / 2)
          .attr('width', s).attr('height', s)
          .attr('rx', 4)
          .attr('fill', '#0891B2')
          .attr('opacity', 0.85)
          .attr('stroke', TIER_RING[d.tier || ''] || 'none')
          .attr('stroke-width', 1.5)
      }

      // Label (halo keeps it legible over edges); dense graphs only label key nodes
      const keyNode = isControlPlaneTier(d.tier) || !!d.tierViolation
      el.append('text')
        .attr('class', 'ig-label')
        .text(d.label.length > 16 ? d.label.slice(0, 16) + '…' : d.label)
        .attr('dy', radius + 14)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-primary)')
        .attr('font-size', '10px')
        .attr('paint-order', 'stroke')
        .attr('stroke', 'var(--bg-primary)')
        .attr('stroke-width', 3)
        .attr('pointer-events', 'none')
        .attr('opacity', !dense || keyNode ? 1 : 0)
        .attr('data-key', keyNode ? '1' : '0')
    })

    // ── Interactions ──

    // Click
    node.on('click', (event, d) => {
      event.stopPropagation()
      if (onNodeClick) onNodeClick(d)
    })

    // Double-click
    node.on('dblclick', (event, d) => {
      event.stopPropagation()
      event.preventDefault()
      if (onNodeDoubleClick) onNodeDoubleClick(d)
    })

    // Right-click (context menu)
    node.on('contextmenu', (event, d) => {
      event.preventDefault()
      event.stopPropagation()
      if (onNodeRightClick) onNodeRightClick(d, event.clientX, event.clientY)
    })

    // Hover: highlight connected edges, dim unconnected
    node.on('mouseenter', function (event, d) {
      setTooltip({ x: event.clientX, y: event.clientY, node: d })

      // Highlight connected
      const connectedNodeIds = new Set<string>([d.id])
      link.each(function (l) {
        const sid = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id
        const tid = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id
        if (sid === d.id || tid === d.id) {
          connectedNodeIds.add(sid)
          connectedNodeIds.add(tid)
          d3.select(this)
            .attr('opacity', 1)
            .attr('stroke-width', (EDGE_STYLES[l.type]?.width || 1) * 2)
        } else {
          d3.select(this).attr('opacity', 0.1)
        }
      })

      node.each(function (n) {
        d3.select(this).attr('opacity', connectedNodeIds.has(n.id) ? 1 : 0.2)
      })
      // Reveal labels of the hovered node and its neighbours
      node.select<SVGTextElement>('text.ig-label')
        .attr('opacity', (n: GraphNode) => (connectedNodeIds.has(n.id) ? 1 : (!dense ? 0.25 : 0)))
    })

    node.on('mouseleave', function () {
      setTooltip(null)
      link
        .attr('opacity', 0.5)
        .attr('stroke-width', (d: any) => EDGE_STYLES[d.type]?.width || 1)
      node.attr('opacity', 1)
      node.select<SVGTextElement>('text.ig-label')
        .attr('opacity', function () { return !dense || this.getAttribute('data-key') === '1' ? 1 : 0 })
    })

    // ── Tick ──
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      edgeLabels
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    // Once the layout settles, zoom out (never in) so every node fits the canvas;
    // the force layout spreads larger graphs past the edges otherwise.
    simulation.on('end', () => {
      if (userMoved) return
      // Bounds of the nodes themselves (labels and arrowheads only add a little)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const n of simNodes) {
        if (n.x == null || n.y == null) continue
        const r = getNodeRadius(n) + 6
        x0 = Math.min(x0, n.x - r); y0 = Math.min(y0, n.y - r)
        x1 = Math.max(x1, n.x + r); y1 = Math.max(y1, n.y + r)
      }
      if (!isFinite(x0) || x1 <= x0 || y1 <= y0) return
      const pad = 32 // room for labels under the outermost nodes
      const scale = Math.min(1, (width - pad * 2) / (x1 - x0), (height - pad * 2) / (y1 - y0))
      const tx = width / 2 - scale * ((x0 + x1) / 2)
      const ty = height / 2 - scale * ((y0 + y1) / 2)
      svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
    })

    return () => { simulation.stop() }
  }, [nodes, links, width, height, layout, onNodeClick, onNodeDoubleClick, onNodeRightClick, onEdgeHover, visibleEdgeTypes, getNodeRadius, dense, edgeLabelKey])

  const nodeTypeLabel = (n: GraphNode) => (tEnum.has(`nodeTypes.${n.type}`) ? tEnum(`nodeTypes.${n.type}`) : n.type)
  const subTypeLabel = (s: string) => {
    if (tId.has(s)) return tId(s)
    if (tEnum.has(`violationTypes.${s}`)) return tEnum(`violationTypes.${s}`)
    if (tEnum.has(`resourceTypes.${s}`)) return tEnum(`resourceTypes.${s}`)
    return s.replace(/_/g, ' ')
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        direction="ltr"
        role="img"
        aria-label={t('canvasLabel', { nodes: nodes.length, edges: links.length })}
        className="block max-w-full rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]"
        style={{ boxShadow: 'var(--shadow-card)' }}
      />

      {/* Legend (collapsible so it never hides the graph on small screens) */}
      <div className="absolute top-3 start-3 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-badge)] text-micro select-none text-[var(--text-primary)] max-w-[calc(100%-1.5rem)]">
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          className="w-full px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide text-start"
        >
          {t('legend')} {legendOpen ? '−' : '+'}
        </button>
        {legendOpen && (
          <div className="px-2 pb-2 space-y-1">
            <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">{t('nodes')}</p>
            <div className="flex items-center gap-2"><span aria-hidden className="w-3 h-3 shrink-0 rounded-full" style={{ background: '#2563EB' }} /> {t('human')}</div>
            <div className="flex items-center gap-2"><span aria-hidden className="w-3 h-3 shrink-0 rounded-full" style={{ background: '#7C3AED' }} /> {t('nhi')}</div>
            <div className="flex items-center gap-2"><span aria-hidden className="w-3 h-3 shrink-0 rounded" style={{ background: '#5F6B7A' }} /> {t('resource')}</div>
            <div className="flex items-center gap-2"><span aria-hidden className="w-3 h-3 shrink-0 rounded rotate-45" style={{ background: '#CA8A04' }} /> {t('group')}</div>
            <div className="flex items-center gap-2">
              <svg aria-hidden className="w-3 h-3 shrink-0" viewBox="-8 -8 16 16"><path d="M0,-7 L7,4 L-7,4 Z" fill="#DC2626" /></svg>
              {t('violation')}
            </div>
            <div className="flex items-center gap-2">
              <svg aria-hidden className="w-3 h-3 shrink-0" viewBox="-8 -8 16 16">
                <polygon points="6.9,4 4,6.9 -4,6.9 -6.9,4 -6.9,-4 -4,-6.9 4,-6.9 6.9,-4" fill="#4F46E5" />
              </svg>
              {t('account')}
            </div>
            <div className="flex items-center gap-2"><span aria-hidden className="w-3 h-3 shrink-0 rounded" style={{ background: '#0891B2' }} /> {t('gpo')}</div>
            <div className="flex items-center gap-2"><span aria-hidden className="w-3 h-3 shrink-0 rounded-full border-2 border-[var(--color-critical)]" /> {t('tierViolation')}</div>
            <div className="border-t border-[var(--border-default)] my-1 pt-1 space-y-1">
              <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">{t('edges')}</p>
              <div className="flex items-center gap-2"><span aria-hidden className="shrink-0 w-4 h-0.5" style={{ background: '#94a3b8' }} /> {tEnum('edgeTypes.entitlement')}</div>
              <div className="flex items-center gap-2"><span aria-hidden className="shrink-0 w-4 h-0.5 border-t border-dashed" style={{ borderColor: '#cbd5e1' }} /> {tEnum('edgeTypes.membership')}</div>
              <div className="flex items-center gap-2"><span aria-hidden className="shrink-0 w-4 h-0.5 border-t border-dashed" style={{ borderColor: '#3B82F6' }} /> {tEnum('edgeTypes.manager')}</div>
              <div className="flex items-center gap-2"><span aria-hidden className="shrink-0 w-4 h-0.5 border-t border-dashed" style={{ borderColor: '#8B5CF6' }} /> {tEnum('edgeTypes.owner')}</div>
              <div className="flex items-center gap-2"><span aria-hidden className="shrink-0 w-4 h-[2px]" style={{ background: '#DC2626' }} /> {tEnum('edgeTypes.violation')}</div>
              <div className="flex items-center gap-2"><span aria-hidden className="shrink-0 w-4 h-0.5 border-t border-dashed" style={{ borderColor: '#4F46E5' }} /> {tEnum('edgeTypes.account')}</div>
              <div className="flex items-center gap-2"><span aria-hidden className="shrink-0 w-4 h-0.5 border-t border-dashed" style={{ borderColor: '#0891B2' }} /> {tEnum('edgeTypes.gpo_link')}</div>
              <div className="flex items-center gap-2"><span aria-hidden className="shrink-0 w-4 h-[1.5px]" style={{ background: '#DC2626' }} /> {tEnum('edgeTypes.gpo_edit')}</div>
            </div>
          </div>
        )}
      </div>

      {/* Node tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-3 text-caption pointer-events-none max-w-[240px]"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12, boxShadow: 'var(--shadow-dropdown)' }}
        >
          <p className="font-medium text-[var(--text-primary)]"><bdi>{tooltip.node.label}</bdi></p>
          <p className="text-[var(--text-secondary)]">{nodeTypeLabel(tooltip.node)} {tooltip.node.subType ? `· ${subTypeLabel(tooltip.node.subType)}` : ''}</p>
          {tooltip.node.tier && <p className="text-[var(--text-secondary)]">{t('tier')}: {tTiers.has(tooltip.node.tier) ? tTiers(tooltip.node.tier) : tooltip.node.tier.replace('_', ' ')}</p>}
          {tooltip.node.riskScore !== undefined && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[var(--text-secondary)] text-xs">{t('risk')}:</span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    tooltip.node.riskScore >= 80 ? 'bg-red-500' :
                    tooltip.node.riskScore >= 60 ? 'bg-orange-500' :
                    tooltip.node.riskScore >= 40 ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${tooltip.node.riskScore}%` }}
                />
              </div>
              <span className="text-[var(--text-secondary)] text-xs font-medium">{tooltip.node.riskScore}</span>
            </div>
          )}
          {tooltip.node.tierViolation && <p className="text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))] font-medium text-xs mt-1">{t('tierViolation')}</p>}
          {tooltip.node.type === 'violation' && tooltip.node.properties?.severity && (
            <p className="text-xs mt-1"><span className="text-[var(--text-secondary)]">{t('severity')}:</span> {tSev.has(tooltip.node.properties.severity) ? tSev(tooltip.node.properties.severity) : tooltip.node.properties.severity}</p>
          )}
        </div>
      )}
    </div>
  )
}

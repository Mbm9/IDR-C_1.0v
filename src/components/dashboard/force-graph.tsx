'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useTranslations } from 'next-intl'
import { Search, ZoomIn, ZoomOut, Maximize2, RotateCcw, Pause, Play, X, Tag } from 'lucide-react'
import { isControlPlaneTier } from '@/lib/utils/tiers'

// ── Generic graph model ──
export interface FgNode {
  id: string
  label: string
  group: string // colour key
  tier?: string // tier_0 | tier_top | tier_1 | tier_2 → ring colour
  riskScore?: number // 0–100 → radius
  severity?: 'critical' | 'high' | 'medium' | 'low' // outer ring
  badge?: string | number
  meta?: Record<string, any>
  // d3 sim runtime
  x?: number; y?: number; fx?: number | null; fy?: number | null
}
export interface FgLink {
  source: string
  target: string
  type?: string
  label?: string
  dangerous?: boolean
}
export interface FgFilterGroup { key: string; label: string; color?: string }
export interface ForceGraphProps {
  nodes: FgNode[]
  links: FgLink[]
  colorOf: (group: string) => string
  height?: number
  filterGroups?: FgFilterGroup[]
  onSelect?: (node: FgNode | null) => void
  searchPlaceholder?: string
  /** Accessible name for the graph canvas */
  ariaLabel?: string
}

// Above this many nodes, labels default to "key" mode (focused node, its neighbours,
// Tier 0 / Top Tier / critical nodes and search matches) so the canvas stays legible.
const DENSE_GRAPH = 30
const isKeyNode = (n: FgNode) =>
  isControlPlaneTier(n.tier) || n.severity === 'critical' || n.severity === 'high' || (n.riskScore ?? 0) >= 80

// Labels are counter-scaled against the zoom so they stay this size on screen.
const LABEL_PX = 11
const EDGE_LABEL_PX = 10
const LABEL_MAX = 24
// In "key" mode, zooming in past this multiple of the fitted scale reveals every label.
const ZOOM_ALL_LABELS = 1.5
// On-screen label box height (text + halo) and the gap between a node's outer ring and its label.
const LINE_PX = LABEL_PX + 3
const LABEL_GAP = 3
// Fallback glyph width when a label can't be measured yet (e.g. the canvas isn't laid out).
const CHAR_PX = LABEL_PX * 0.58
// Spatial-grid cell size (screen px) for the label/node collision check.
const GRID_PX = 48
const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s)

const TIER_RING: Record<string, string> = { tier_0: '#DC2626', tier_top: '#BE123C', tier_1: '#EA580C', tier_2: '#64748B' }
const SEVERITY_RING: Record<string, string> = { critical: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#64748B' }

/** Fallback risk (→ node radius) when only the tier is known; Top Tier sits between T0 and T1. */
const TIER_NODE_RISK: Record<string, number> = { tier_0: 90, tier_top: 75, tier_1: 60 }
export function riskForTier(tier?: string | null): number {
  return TIER_NODE_RISK[tier ?? ''] ?? 30
}

function radiusOf(n: FgNode): number {
  return Math.max(7, Math.min(22, 7 + (n.riskScore ?? 20) / 6))
}
/** Outer extent of a node (body + tier/severity rings + stroke), in graph units. */
function extentOf(n: FgNode): number {
  return radiusOf(n) + (n.severity ? 5 : n.tier && n.tier !== 'unclassified' ? 2.5 : 0.75)
}

/**
 * Candidate label slots around a node, tried in order: below, above, right, left.
 * x/y are graph units (× the node extent, so they follow the zoomed circle); dx/dy are em,
 * so they track the counter-scaled font and stay constant on screen. Boxes are computed
 * in screen space by `slotBox`.
 */
const SLOTS = [
  { x: 0, y: 1, dx: '0', dy: `${(LABEL_GAP + LABEL_PX * 0.95) / LABEL_PX}em`, anchor: 'middle' },
  { x: 0, y: -1, dx: '0', dy: `${-(LABEL_GAP + LABEL_PX * 0.3) / LABEL_PX}em`, anchor: 'middle' },
  { x: 1, y: 0, dx: `${LABEL_GAP / LABEL_PX}em`, dy: '0.35em', anchor: 'start' },
  { x: -1, y: 0, dx: `${-LABEL_GAP / LABEL_PX}em`, dy: '0.35em', anchor: 'end' },
] as const
type Box = { x0: number; y0: number; x1: number; y1: number }
function slotBox(slot: number, cx: number, cy: number, ext: number, w: number): Box {
  const h = LINE_PX
  switch (slot) {
    case 0: return { x0: cx - w / 2, y0: cy + ext + LABEL_GAP - 1, x1: cx + w / 2, y1: cy + ext + LABEL_GAP - 1 + h }
    case 1: return { x0: cx - w / 2, y0: cy - ext - LABEL_GAP - h + 1, x1: cx + w / 2, y1: cy - ext - LABEL_GAP + 1 }
    case 2: return { x0: cx + ext + LABEL_GAP - 1, y0: cy - h / 2, x1: cx + ext + LABEL_GAP - 1 + w, y1: cy + h / 2 }
    default: return { x0: cx - ext - LABEL_GAP + 1 - w, y0: cy - h / 2, x1: cx - ext - LABEL_GAP + 1, y1: cy + h / 2 }
  }
}

/** Measured on-screen label widths (px incl. halo), keyed by font size + text. On-screen size is zoom-independent. */
const labelWidthCache = new Map<string, number>()
const widthKey = (text: string) => `${LABEL_PX}|${text}`

/** Uniform grid over the viewport: obstacles (node circles, placed labels) bucketed by cell. */
class CollisionGrid {
  private cells = new Map<number, { b: Box; owner: string }[]>()
  constructor(private cols: number, private rows: number) {}
  private range(b: Box) {
    const c0 = Math.max(0, Math.floor(b.x0 / GRID_PX)), c1 = Math.min(this.cols - 1, Math.floor(b.x1 / GRID_PX))
    const r0 = Math.max(0, Math.floor(b.y0 / GRID_PX)), r1 = Math.min(this.rows - 1, Math.floor(b.y1 / GRID_PX))
    return { c0, c1, r0, r1 }
  }
  add(b: Box, owner: string) {
    const { c0, c1, r0, r1 } = this.range(b)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * this.cols + c
      const cell = this.cells.get(k)
      if (cell) cell.push({ b, owner }); else this.cells.set(k, [{ b, owner }])
    }
  }
  /** True if `b` intersects anything not owned by `owner` (a label may touch its own node). */
  hits(b: Box, owner: string) {
    const { c0, c1, r0, r1 } = this.range(b)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const cell = this.cells.get(r * this.cols + c)
      if (cell) for (const o of cell) {
        if (o.owner !== owner && b.x0 < o.b.x1 && b.x1 > o.b.x0 && b.y0 < o.b.y1 && b.y1 > o.b.y0) return true
      }
    }
    return false
  }
}

export function ForceGraph({
  nodes, links, colorOf, height = 560, filterGroups, onSelect, searchPlaceholder, ariaLabel,
}: ForceGraphProps) {
  const t = useTranslations('forceGraph')
  const tTiers = useTranslations('tiers')
  const tSev = useTranslations('severity')
  const tId = useTranslations('identity')
  const groupLabel = (g: string) => filterGroups?.find((f) => f.key === g)?.label
    ?? (t.has(`groups.${g}`) ? t(`groups.${g}`) : g.replace(/_/g, ' '))
  const tierLabel = (tier: string) => (tTiers.has(tier) ? tTiers(tier) : tier.replace('_', ' '))
  const metaLabel = (k: string) => (t.has(`meta.${k}`) ? t(`meta.${k}`) : k.replace(/_/g, ' '))
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const simRef = useRef<d3.Simulation<FgNode, undefined> | null>(null)
  // d3 selections kept across renders so emphasis updates don't rebuild the sim
  const selRef = useRef<{
    node?: d3.Selection<SVGGElement, FgNode, SVGGElement, unknown>
    link?: d3.Selection<SVGLineElement, any, SVGGElement, unknown>
    linkLabel?: d3.Selection<SVGTextElement, any, SVGGElement, unknown>
  }>({})
  const adjRef = useRef<Map<string, Set<string>>>(new Map())
  // Scale chosen by the last fit-to-view; "zoomed in" is measured relative to it.
  const fitKRef = useRef(1)
  // Latest label inputs, read by the rAF-throttled label pass (zoom/tick don't re-render React).
  const labelStateRef = useRef<{ mode: 'all' | 'focus' | 'off'; focus: string | null; q: string; hidden: Set<string> }>(
    { mode: 'all', focus: null, q: '', hidden: new Set() })
  const labelRafRef = useRef<number | null>(null)
  // Label <text> per node id, and the slot each currently uses (-1 = hidden), so a pass only touches what changed.
  const labelElRef = useRef<Map<string, SVGTextElement>>(new Map())
  const labelSlotRef = useRef<Map<string, number>>(new Map())

  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [pinned, setPinned] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [frozen, setFrozen] = useState(false)
  const [labelMode, setLabelMode] = useState<'all' | 'focus' | 'off'>(() => (nodes.length > DENSE_GRAPH ? 'focus' : 'all'))
  const [selected, setSelected] = useState<FgNode | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; n: FgNode } | null>(null)

  const focus = pinned ?? hover

  // New data set: pick a label density that keeps it legible.
  useEffect(() => { setLabelMode(nodes.length > DENSE_GRAPH ? 'focus' : 'all') }, [nodes])

  // Adjacency for neighbour highlighting.
  useMemo(() => {
    const adj = new Map<string, Set<string>>()
    for (const n of nodes) adj.set(n.id, new Set())
    for (const l of links) {
      adj.get(l.source)?.add(l.target)
      adj.get(l.target)?.add(l.source)
    }
    adjRef.current = adj
  }, [nodes, links])

  // ── Build the simulation + DOM once per data/size change ──
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const width = wrapRef.current?.clientWidth ?? 900
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const defs = svg.append('defs')
    for (const m of [{ id: 'fg-arrow', color: '#94a3b8' }, { id: 'fg-arrow-danger', color: '#DC2626' }]) {
      defs.append('marker').attr('id', m.id).attr('viewBox', '0 -5 10 10').attr('refX', 20)
        .attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', m.color)
    }

    const g = svg.append('g').style('--fg-k', '1')

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4])
      .on('zoom', (e) => {
        g.attr('transform', e.transform.toString()).style('--fg-k', String(e.transform.k))
        scheduleLabels()
      })
    svg.call(zoom)
    zoomRef.current = zoom

    const simNodes = nodes.map((n) => ({ ...n }))
    const byId = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks = links
      .filter((l) => byId.has(l.source) && byId.has(l.target))
      .map((l) => ({ ...l }))

    const sim = d3.forceSimulation<FgNode>(simNodes)
      .force('link', d3.forceLink<FgNode, any>(simLinks).id((d: any) => d.id).distance(140).strength(0.35))
      .force('charge', d3.forceManyBody().strength(-650).distanceMax(600))
      .force('center', d3.forceCenter(width / 2, height / 2))
      // collision padding scales with the node's label so text doesn't overlap neighbours
      .force('collision', d3.forceCollide<FgNode>().radius((d) => radiusOf(d) + 14 + Math.min(70, d.label.length * 3.2)).iterations(2))
    simRef.current = sim

    const link = g.append('g').attr('stroke-linecap', 'round')
      .selectAll<SVGLineElement, any>('line').data(simLinks).join('line')
      .attr('stroke', (d) => (d.dangerous ? '#DC2626' : '#94a3b8'))
      .attr('stroke-width', (d) => (d.dangerous ? 2.5 : 1.5))
      .attr('marker-end', (d) => (d.dangerous ? 'url(#fg-arrow-danger)' : 'url(#fg-arrow)'))

    // Edge labels (technique / relationship)
    const linkLabel = g.append('g')
      .selectAll<SVGTextElement, any>('text').data(simLinks.filter((l) => l.label)).join('text')
      .attr('class', 'fg-elabel')
      .text((d) => truncate(d.label!, 18))
      .style('font-size', `calc(${EDGE_LABEL_PX}px / var(--fg-k, 1))`).attr('font-weight', 600)
      .attr('fill', (d) => (d.dangerous ? '#DC2626' : 'var(--text-tertiary)'))
      .attr('text-anchor', 'middle').attr('paint-order', 'stroke')
      .attr('stroke', 'var(--bg-primary)').style('stroke-width', 'calc(3px / var(--fg-k, 1))')
      .style('pointer-events', 'none').attr('opacity', 0)

    const node = g.append('g')
      .selectAll<SVGGElement, FgNode>('g').data(simNodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, FgNode>()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); if (!frozen) { d.fx = null; d.fy = null } }))

    // severity ring (outermost)
    node.filter((d) => !!d.severity).append('circle')
      .attr('r', (d) => radiusOf(d) + 4).attr('fill', 'none')
      .attr('stroke', (d) => SEVERITY_RING[d.severity!]).attr('stroke-width', 2).attr('opacity', 0.8)
    // tier ring
    node.filter((d) => !!d.tier && d.tier !== 'unclassified').append('circle')
      .attr('r', (d) => radiusOf(d) + 1.5).attr('fill', 'none')
      .attr('stroke', (d) => TIER_RING[d.tier!] ?? '#64748B').attr('stroke-width', 2)
    // main body
    node.append('circle').attr('class', 'fg-body')
      .attr('r', (d) => radiusOf(d)).attr('fill', (d) => colorOf(d.group))
      .attr('stroke', 'var(--bg-primary)').attr('stroke-width', 1.5)
    // badge
    node.filter((d) => d.badge != null).append('text')
      .text((d) => String(d.badge)).attr('text-anchor', 'middle').attr('dy', 3)
      .attr('font-size', 9).attr('font-weight', 700).attr('fill', '#fff').style('pointer-events', 'none')
    // label: constant on-screen size (font/halo divided by the zoom scale), halo for
    // legibility over edges/nodes; the full name lives in the hover tooltip.
    // Position (slot around the node) is chosen per frame by updateLabels.
    const labelEls = new Map<string, SVGTextElement>()
    node.append('text').attr('class', 'fg-label')
      .text((d) => truncate(d.label, LABEL_MAX))
      .style('font-size', `calc(${LABEL_PX}px / var(--fg-k, 1))`).attr('font-weight', 500).attr('fill', 'var(--text-primary)')
      .attr('paint-order', 'stroke').attr('stroke', 'var(--bg-primary)')
      .style('stroke-width', 'calc(3px / var(--fg-k, 1))').attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none').attr('opacity', 0)
      .each(function (d) { labelEls.set(d.id, this) })
    labelElRef.current = labelEls
    labelSlotRef.current = new Map()

    node
      .on('mouseenter', (e, d) => { setHover(d.id); setTip({ x: e.offsetX, y: e.offsetY, n: d }) })
      .on('mousemove', (e) => setTip((t) => (t ? { ...t, x: e.offsetX, y: e.offsetY } : t)))
      .on('mouseleave', () => { setHover(null); setTip(null) })
      .on('click', (e, d) => {
        e.stopPropagation()
        setPinned((p) => (p === d.id ? null : d.id))
        setSelected(d); onSelect?.(d)
      })

    svg.on('click', () => { setPinned(null); setSelected(null); onSelect?.(null) })

    sim.on('tick', () => {
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
      linkLabel.attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 3)
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
      scheduleLabels()
    })

    selRef.current = { node, link, linkLabel }
    scheduleLabels()

    // fit after settle
    const fit = setTimeout(() => fitToView(), 600)
    return () => {
      clearTimeout(fit); sim.stop()
      if (labelRafRef.current != null) { cancelAnimationFrame(labelRafRef.current); labelRafRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, height])

  /** Coalesce label passes (zoom events, sim ticks, state changes) into one per frame. */
  function scheduleLabels() {
    if (labelRafRef.current != null) return
    labelRafRef.current = requestAnimationFrame(() => { labelRafRef.current = null; updateLabels() })
  }

  /**
   * Decide which node labels show and where. Off → none (search matches still show).
   * Key → the focused node + neighbours, search matches and key nodes (Tier 0 / Top Tier /
   * high-risk); past ZOOM_ALL_LABELS × the fitted scale every node is a candidate.
   * All → every node is a candidate. Candidates are placed greedily by priority (key nodes
   * first) into the first free slot (below, above, right, left) that clears every placed label
   * and every other fully-drawn node circle; otherwise skipped. The hovered/pinned node and
   * search matches always draw, ignoring collisions. Collisions use a screen-space grid, O(n).
   */
  function updateLabels() {
    const { node } = selRef.current
    const svg = svgRef.current
    if (!node || !svg) return
    const { mode, focus, q, hidden } = labelStateRef.current
    const tr = d3.zoomTransform(svg)
    const zoomedIn = tr.k >= fitKRef.current * ZOOM_ALL_LABELS
    const neigh = focus ? adjRef.current.get(focus) : null
    const matches = (n: FgNode) => q !== '' && n.label.toLowerCase().includes(q)
    const width = wrapRef.current?.clientWidth ?? 900
    const els = labelElRef.current
    const slotOf = new Map<string, number>() // id → slot for labels that draw
    const { linkLabel } = selRef.current
    const edgeOp = new Map<SVGTextElement, number>() // edge labels that draw → opacity

    if (mode !== 'off' || q !== '') {
      type Cand = { n: FgNode; prio: number; force: boolean }
      const cands: Cand[] = []
      const grid = new CollisionGrid(Math.ceil(width / GRID_PX) + 1, Math.ceil(height / GRID_PX) + 1)
      node.each((n) => {
        if (hidden.has(n.group)) return
        const sx = tr.x + tr.k * (n.x ?? 0), sy = tr.y + tr.k * (n.y ?? 0), se = tr.k * extentOf(n)
        // Fully drawn nodes are obstacles; ones dimmed by focus/search aren't.
        const dimmed = (q !== '' && !matches(n)) || (!!focus && n.id !== focus && !neigh?.has(n.id))
        if (!dimmed) grid.add({ x0: sx - se, y0: sy - se, x1: sx + se, y1: sy + se }, n.id)
        if (q !== '') { if (matches(n)) cands.push({ n, prio: 4, force: true }); return }
        if (focus) {
          if (n.id === focus) cands.push({ n, prio: 5, force: true })
          else if (neigh?.has(n.id)) cands.push({ n, prio: 3, force: false })
          return
        }
        if (isKeyNode(n)) cands.push({ n, prio: 2, force: false })
        else if (mode === 'all' || zoomedIn) cands.push({ n, prio: 1, force: false })
      })
      cands.sort((a, b) => b.prio - a.prio || (b.n.riskScore ?? 0) - (a.n.riskScore ?? 0))

      // Measure unmeasured labels in one read batch (no DOM writes in between). The font is
      // LABEL_PX / k user units, so on-screen width = computed length × k.
      for (const { n } of cands) {
        const el = els.get(n.id)
        const key = widthKey(el?.textContent ?? '')
        if (!el || labelWidthCache.has(key)) continue
        const len = el.getComputedTextLength() * tr.k
        if (len > 0) labelWidthCache.set(key, len + 3) // + halo
      }

      for (const { n, force } of cands) {
        const text = els.get(n.id)?.textContent ?? ''
        const w = labelWidthCache.get(widthKey(text)) ?? Math.min(n.label.length, LABEL_MAX) * CHAR_PX
        const sx = tr.x + tr.k * (n.x ?? 0), sy = tr.y + tr.k * (n.y ?? 0), se = tr.k * extentOf(n)
        let chosen = -1
        for (let s = 0; s < SLOTS.length; s++) {
          const b = slotBox(s, sx, sy, se, w)
          if (b.x1 < 0 || b.x0 > width || b.y1 < 0 || b.y0 > height) continue // off-screen
          if (!force && grid.hits(b, n.id)) continue
          chosen = s; grid.add(b, n.id); break
        }
        if (chosen < 0 && force) chosen = 0
        if (chosen >= 0) slotOf.set(n.id, chosen)
      }

      // Edge labels go through the same grid after node labels: ones touching the focused node
      // always draw; in "All" the rest draw only where they fit.
      if (mode !== 'off' && linkLabel) {
        const edgeEls = linkLabel.nodes()
        const ends = (d: any): [FgNode, FgNode] => [d.source, d.target]
        const want = (d: any) => {
          const [a, b] = ends(d)
          if (hidden.has(a.group) || hidden.has(b.group)) return 0
          if (focus) return a.id === focus || b.id === focus ? 2 : 0
          return mode === 'all' ? 1 : 0
        }
        for (const el of edgeEls) {
          const key = `${EDGE_LABEL_PX}|${el.textContent ?? ''}`
          if (labelWidthCache.has(key) || !want(d3.select(el).datum())) continue
          const len = el.getComputedTextLength() * tr.k
          if (len > 0) labelWidthCache.set(key, len + 3)
        }
        edgeEls.forEach((el, i) => {
          const d = d3.select(el).datum() as any
          const w = want(d)
          if (!w) return
          const [a, b] = ends(d)
          const cx = tr.x + tr.k * ((a.x ?? 0) + (b.x ?? 0)) / 2, base = tr.y + tr.k * (((a.y ?? 0) + (b.y ?? 0)) / 2 - 3)
          const tw = labelWidthCache.get(`${EDGE_LABEL_PX}|${el.textContent ?? ''}`) ?? (el.textContent?.length ?? 0) * EDGE_LABEL_PX * 0.58
          const box = { x0: cx - tw / 2, y0: base - EDGE_LABEL_PX, x1: cx + tw / 2, y1: base + 3 }
          if (box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height) return
          if (w === 1 && grid.hits(box, `e${i}`)) return
          grid.add(box, `e${i}`)
          edgeOp.set(el, w === 2 ? 1 : 0.85)
        })
      }
    }

    // Write only labels whose slot/visibility changed.
    const prev = labelSlotRef.current
    for (const [id, el] of els) {
      const slot = slotOf.get(id) ?? -1
      if (prev.get(id) === slot) continue
      prev.set(id, slot)
      if (slot < 0) { el.setAttribute('opacity', '0'); continue }
      const sl = SLOTS[slot]
      const ext = extentOf((d3.select(el.parentNode as SVGGElement).datum() as FgNode))
      el.setAttribute('x', String(sl.x * ext)); el.setAttribute('y', String(sl.y * ext))
      el.setAttribute('dx', sl.dx); el.setAttribute('dy', sl.dy)
      el.setAttribute('text-anchor', sl.anchor); el.setAttribute('opacity', '1')
    }
    linkLabel?.each(function () {
      const op = String(edgeOp.get(this) ?? 0)
      if (this.getAttribute('opacity') !== op) this.setAttribute('opacity', op)
    })
  }

  // ── Emphasis: focus/neighbours, search, filters ──
  useEffect(() => {
    const { node, link } = selRef.current
    if (!node || !link) return
    const q = search.trim().toLowerCase()
    const neigh = focus ? adjRef.current.get(focus) : null
    const isVisible = (n: FgNode) => !hidden.has(n.group)
    const matches = (n: FgNode) => q === '' || n.label.toLowerCase().includes(q)
    const endsHidden = (d: any) => {
      const s = typeof d.source === 'object' ? d.source.id : d.source
      const tg = typeof d.target === 'object' ? d.target.id : d.target
      const sn = nodes.find((n) => n.id === s); const tn = nodes.find((n) => n.id === tg)
      return (sn && hidden.has(sn.group)) || (tn && hidden.has(tn.group))
    }
    const touchesFocus = (d: any) => {
      const s = typeof d.source === 'object' ? d.source.id : d.source
      const tg = typeof d.target === 'object' ? d.target.id : d.target
      return s === focus || tg === focus
    }

    node.attr('opacity', (d) => {
      if (!isVisible(d)) return 0.05
      if (!matches(d)) return 0.12
      if (focus) return d.id === focus || neigh?.has(d.id) ? 1 : 0.12
      return 1
    }).style('pointer-events', (d) => (isVisible(d) ? 'all' : 'none'))

    // Hovered/pinned node (and its label) draws on top of its neighbours.
    if (focus) node.filter((d) => d.id === focus).raise()

    node.select<SVGCircleElement>('circle.fg-body')
      .attr('stroke', (d) => (q !== '' && matches(d) ? '#F59E0B' : 'var(--bg-primary)'))
      .attr('stroke-width', (d) => (q !== '' && matches(d) ? 3 : 1.5))

    // node + edge labels honour the Labels toggle (all / key / off) and zoom; search always reveals matches
    labelStateRef.current = { mode: labelMode, focus, q, hidden }
    scheduleLabels()

    link.attr('opacity', (d: any) => {
      if (endsHidden(d)) return 0
      if (focus) return touchesFocus(d) ? 0.95 : 0.06
      return 0.75
    })

  }, [focus, search, hidden, nodes, links, labelMode])

  // Freeze/unfreeze
  useEffect(() => {
    const sim = simRef.current
    if (!sim) return
    if (frozen) { sim.nodes().forEach((n) => { n.fx = n.x; n.fy = n.y }) }
    else { sim.nodes().forEach((n) => { n.fx = null; n.fy = null }); sim.alpha(0.3).restart() }
  }, [frozen])

  // ── Controls ──
  function zoomBy(k: number) {
    if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, k)
  }
  function fitToView() {
    const svg = svgRef.current, zoom = zoomRef.current
    if (!svg || !zoom) return
    const g = svg.querySelector('g')
    if (!g) return
    const b = (g as SVGGElement).getBBox()
    if (!b.width || !b.height) return
    const width = wrapRef.current?.clientWidth ?? 900
    const scale = Math.min(2, 0.85 / Math.max(b.width / width, b.height / height))
    fitKRef.current = scale
    const tx = width / 2 - scale * (b.x + b.width / 2)
    const ty = height / 2 - scale * (b.y + b.height / 2)
    d3.select(svg).transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }
  function reset() { setPinned(null); setSelected(null); setSearch(''); setHidden(new Set()); onSelect?.(null); fitToView() }
  const toggleGroup = (key: string) => setHidden((h) => { const n = new Set(h); n.has(key) ? n.delete(key) : n.add(key); return n })

  const btn = 'p-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors'
  const metaValue = (k: string, v: unknown) => {
    const s = String(v)
    if (k === 'type' || k === 'role') return t.has(`groups.${s}`) ? t(`groups.${s}`) : s.replace(/_/g, ' ')
    if (k === 'criticality' && tSev.has(s)) return tSev(s)
    if (k === 'subType') return tId.has(s) ? tId(s) : s.replace(/_/g, ' ')
    return s
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search aria-hidden className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder ?? t('searchNodes')}
            aria-label={searchPlaceholder ?? t('searchNodes')}
            className="w-full ps-8 pe-7 py-1.5 text-sm rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-info)]" />
          {search && <button onClick={() => setSearch('')} aria-label={t('clearSearch')} className="absolute end-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"><X aria-hidden className="w-3.5 h-3.5" /></button>}
        </div>
        {filterGroups?.map((f) => (
          <button key={f.key} onClick={() => toggleGroup(f.key)} aria-pressed={!hidden.has(f.key)}
            className={`text-xs px-2 py-1 rounded-md border flex items-center gap-1.5 transition-colors border-[var(--border-default)] text-[var(--text-secondary)] ${hidden.has(f.key) ? 'line-through decoration-[var(--text-secondary)]' : 'hover:bg-[var(--bg-secondary)]'}`}>
            <span aria-hidden className={`shrink-0 w-2 h-2 rounded-full ${hidden.has(f.key) ? 'opacity-30' : ''}`} style={{ background: f.color ?? colorOf(f.key) }} />{f.label}
          </button>
        ))}
        <div className="flex items-center gap-1 ms-auto">
          {/* Labels toggle */}
          <div role="group" aria-label={t('labels')} title={t('labels')} className="flex items-center rounded-md border border-[var(--border-default)] overflow-hidden me-1">
            <Tag aria-hidden className="w-3.5 h-3.5 mx-1.5 text-[var(--text-secondary)]" />
            {(['all', 'focus', 'off'] as const).map((m) => (
              <button key={m} onClick={() => setLabelMode(m)} aria-pressed={labelMode === m} title={t(`labelModeHint.${m}`)}
                className={`px-2 py-1 text-xs border-s border-[var(--border-default)] transition-colors ${labelMode === m ? 'bg-[var(--color-info-bg)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}>
                {t(`labelMode.${m}`)}
              </button>
            ))}
          </div>
          <button className={btn} onClick={() => zoomBy(1.3)} title={t('zoomIn')} aria-label={t('zoomIn')}><ZoomIn aria-hidden className="w-4 h-4" /></button>
          <button className={btn} onClick={() => zoomBy(1 / 1.3)} title={t('zoomOut')} aria-label={t('zoomOut')}><ZoomOut aria-hidden className="w-4 h-4" /></button>
          <button className={btn} onClick={fitToView} title={t('fitToView')} aria-label={t('fitToView')}><Maximize2 aria-hidden className="w-4 h-4" /></button>
          <button className={btn} onClick={() => setFrozen((f) => !f)} aria-pressed={frozen} title={frozen ? t('resumeLayout') : t('freezeLayout')} aria-label={frozen ? t('resumeLayout') : t('freezeLayout')}>{frozen ? <Play aria-hidden className="w-4 h-4" /> : <Pause aria-hidden className="w-4 h-4" />}</button>
          <button className={btn} onClick={reset} title={t('reset')} aria-label={t('reset')}><RotateCcw aria-hidden className="w-4 h-4 rtl:-scale-x-100" /></button>
        </div>
      </div>

      {/* Canvas (graph geometry stays left-to-right in both locales; text is bidi-isolated) */}
      <div ref={wrapRef} className="relative rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] overflow-hidden">
        <svg ref={svgRef} width="100%" height={height} style={{ display: 'block' }} direction="ltr"
          role="img" aria-label={ariaLabel ?? t('canvasLabel', { nodes: nodes.length, edges: links.length })} />
        {tip && (
          <div className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] shadow text-xs max-w-[240px]"
            style={{ left: Math.max(0, Math.min(tip.x + 12, (wrapRef.current?.clientWidth ?? 900) - 240)), top: tip.y + 12 }}>
            <p className="font-semibold text-[var(--text-primary)]"><bdi>{tip.n.label}</bdi></p>
            <p className="text-[var(--text-secondary)]">{groupLabel(tip.n.group)}{tip.n.tier && tip.n.tier !== 'unclassified' ? ` · ${tierLabel(tip.n.tier)}` : ''}</p>
            {tip.n.riskScore != null && <p className="text-[var(--text-secondary)]">{t('riskValue', { score: tip.n.riskScore })}</p>}
          </div>
        )}
        {selected && (
          <div className="absolute top-2 end-2 z-10 w-60 max-w-[calc(100%-1rem)] rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] shadow-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm text-[var(--text-primary)] break-words"><bdi>{selected.label}</bdi></p>
              <button onClick={() => { setPinned(null); setSelected(null); onSelect?.(null) }} aria-label={t('close')} className="text-[var(--text-secondary)]"><X aria-hidden className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{groupLabel(selected.group)}</p>
            <dl className="mt-2 space-y-1 text-xs">
              {selected.tier && <div className="flex justify-between gap-2"><dt className="text-[var(--text-secondary)]">{t('tier')}</dt><dd className="text-[var(--text-primary)]">{tierLabel(selected.tier)}</dd></div>}
              {selected.severity && <div className="flex justify-between gap-2"><dt className="text-[var(--text-secondary)]">{t('severity')}</dt><dd className="font-medium" style={{ color: `color-mix(in srgb, ${SEVERITY_RING[selected.severity]} 65%, var(--text-primary))` }}>{tSev.has(selected.severity) ? tSev(selected.severity) : selected.severity}</dd></div>}
              {selected.riskScore != null && <div className="flex justify-between gap-2"><dt className="text-[var(--text-secondary)]">{t('risk')}</dt><dd className="text-[var(--text-primary)]">{selected.riskScore}</dd></div>}
              {Object.entries(selected.meta ?? {}).slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2"><dt className="text-[var(--text-secondary)]">{metaLabel(k)}</dt><dd className="text-[var(--text-primary)] text-end break-words"><bdi>{metaValue(k, v)}</bdi></dd></div>
              ))}
            </dl>
            <p className="text-[10px] text-[var(--text-secondary)] mt-2">{t('connections', { count: adjRef.current.get(selected.id)?.size ?? 0 })} · {t('unpinHint')}</p>
          </div>
        )}
        <div className="absolute bottom-2 start-2 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-primary)]/90 rounded px-1.5 py-0.5">
          {t('footer', { nodes: nodes.length, edges: links.length })}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  User, Server, Users, FolderTree, Globe, Monitor, FileCog, Circle,
  type LucideIcon,
} from 'lucide-react'

// Node fills match identity-graph; identity uses the shared --color-human token.
// White icons sit on these fills, so they stay the same in light and dark themes.
const NODE_STYLE: Record<string, { fill: string; Icon: LucideIcon }> = {
  identity: { fill: 'var(--color-human)', Icon: User },
  resource: { fill: '#5F6B7A', Icon: Server },
  group: { fill: '#CA8A04', Icon: Users },
  ou: { fill: '#7C3AED', Icon: FolderTree },
  domain: { fill: '#DC2626', Icon: Globe },
  computer: { fill: '#4F46E5', Icon: Monitor },
  gpo: { fill: '#059669', Icon: FileCog },
  unknown: { fill: '#94A3B8', Icon: Circle },
}

const TIER_COLOR: Record<string, string> = {
  tier_0: 'var(--color-tier0)',
  tier_top: 'var(--color-tier-top)',
  tier_1: 'var(--color-tier1)',
  tier_2: 'var(--color-tier2)',
}

// Technique -> severity tone. `line` is the stroke/fill colour, `text` the AA-legible text colour.
type Tone = { line: string; text: string }
const tone = (k: 'critical' | 'high' | 'medium' | 'info'): Tone => ({ line: `var(--color-${k})`, text: `var(--color-${k}-text)` })
const NEUTRAL: Tone = { line: 'var(--text-tertiary)', text: 'var(--text-secondary)' }
const TECHNIQUE_TONE: Record<string, Tone> = {
  GenericAll: tone('critical'),
  DCSync: tone('critical'),
  ACLAbuse: tone('critical'),
  WriteDACL: tone('high'),
  WriteOwner: tone('high'),
  Delegation: tone('high'),
  AddMember: tone('medium'),
  ForceChangePassword: tone('medium'),
  GroupMembership: tone('medium'),
  Entitlement: tone('info'),
  OwnerOf: { line: 'var(--color-nhi)', text: 'var(--color-nhi)' },
}

const R = 20 // node radius
const RING = 5 // tier ring offset + gap before the arrow tip
const MIN_SPACING = 140 // below this, the chain scrolls horizontally instead of squashing
const MAX_SPACING = 260
const PAD = 70 // room for the first/last node's name label
const CY = 52
const DEFAULT_HEIGHT = 112

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
  height?: number
}

function truncate(s: string, maxChars: number): string {
  return s.length > maxChars ? s.slice(0, Math.max(maxChars - 1, 1)) + '…' : s
}

export function AttackPathChain({ pathNodes, pathEdges, height = DEFAULT_HEIGHT }: AttackPathChainProps) {
  const t = useTranslations('attackPaths')
  const tTiers = useTranslations('tiers')
  const tEnum = useTranslations('securityEnums')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState(0)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 0) setMeasured((prev) => (prev === w ? prev : w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (pathNodes.length === 0) return null

  const tierLabel = (tier: string) => (tTiers.has(tier) ? tTiers(tier) : tier.replace(/_/g, ' '))
  const nodeTypeLabel = (type: string) => (tEnum.has(`nodeTypes.${type}`) ? tEnum(`nodeTypes.${type}`) : t('unknown'))
  const edgeTypeLabel = (type: string) => (tEnum.has(`edgeTypes.${type}`) ? tEnum(`edgeTypes.${type}`) : type.replace(/_/g, ' '))

  const gaps = Math.max(pathNodes.length - 1, 1)
  const available = measured || MIN_SPACING * gaps + PAD * 2
  const spacing = Math.min(MAX_SPACING, Math.max(MIN_SPACING, (available - PAD * 2) / gaps))
  const chainWidth = spacing * (pathNodes.length - 1)
  const svgWidth = Math.max(available, chainWidth + PAD * 2)
  const x0 = (svgWidth - chainWidth) / 2
  const xs = pathNodes.map((_, i) => x0 + i * spacing)

  // ~6px per char at 10px; ~5.5px at 9px semibold.
  const nameChars = Math.floor((spacing - 12) / 6)
  const labelWidth = spacing - 2 * (R + RING) - 6
  const techChars = Math.floor((labelWidth - 10) / 5.5)

  const summary = pathNodes.map((n) => n.name).join(' → ')
  const showTip = (e: React.MouseEvent, content: string) => setTooltip({ x: e.clientX, y: e.clientY, content })
  const hideTip = () => setTooltip(null)

  return (
    <div dir="ltr" className="relative">
      <div
        ref={wrapRef}
        tabIndex={0}
        role="region"
        aria-label={t('chain.region')}
        // w-0 + min-w-full: never widens a parent table cell; scrolls instead.
        className="w-0 min-w-full overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]"
      >
        <svg width={svgWidth} height={height} role="img" aria-label={t('chain.summary', { path: summary })} className="block">
          {pathEdges.map((edge, i) => {
            const fromX = xs[i]
            const toX = xs[i + 1]
            if (fromX === undefined || toX === undefined) return null
            const c = TECHNIQUE_TONE[edge.technique] ?? NEUTRAL
            const x1 = fromX + R + RING
            const tip = toX - R - RING
            const midX = (fromX + toX) / 2
            // When the technique just repeats the edge type (e.g. "Entitlement", "manager"), show the
            // translated type once; real AD techniques (GenericAll, WriteDACL...) stay as-is.
            const sameAsType = edge.technique.toLowerCase() === edge.type.toLowerCase()
            const tech = truncate(sameAsType ? edgeTypeLabel(edge.type) : edge.technique, techChars)
            const pillW = Math.min(labelWidth, tech.length * 5.5 + 12)
            const tipText = [sameAsType ? null : edge.technique, edgeTypeLabel(edge.type), edge.label].filter(Boolean).join('\n')
            return (
              <g key={`${edge.source}-${edge.target}-${i}`} onMouseMove={(e) => showTip(e, tipText)} onMouseLeave={hideTip}>
                <line x1={x1} y1={CY} x2={tip} y2={CY} stroke="transparent" strokeWidth={14} />
                <line x1={x1} y1={CY} x2={tip - 7} y2={CY} stroke={c.line} strokeWidth={2.5} />
                <path d={`M${tip},${CY} L${tip - 9},${CY - 5} L${tip - 9},${CY + 5} Z`} fill={c.line} />
                <rect x={midX - pillW / 2} y={CY - 25} width={pillW} height={16} rx={4} fill={c.line} fillOpacity={0.14} />
                <text x={midX} y={CY - 14} textAnchor="middle" fill={c.text} fontSize={9} fontWeight={600} pointerEvents="none">
                  {tech}
                </text>
                {!sameAsType && (
                  <text x={midX} y={CY + 17} textAnchor="middle" fill="var(--text-tertiary)" fontSize={9} pointerEvents="none">
                    {truncate(edgeTypeLabel(edge.type), techChars)}
                  </text>
                )}
              </g>
            )
          })}

          {pathNodes.map((node, i) => {
            const { fill, Icon } = NODE_STYLE[node.type] ?? NODE_STYLE.unknown
            const tierColor = node.tier ? TIER_COLOR[node.tier] : undefined
            const tipText = [
              node.name,
              t('chain.type', { type: nodeTypeLabel(node.type) }),
              node.tier ? t('chain.tier', { tier: tierLabel(node.tier) }) : null,
            ].filter(Boolean).join('\n')
            return (
              <g
                key={`${node.id}-${i}`}
                transform={`translate(${xs[i]}, ${CY})`}
                onMouseMove={(e) => showTip(e, tipText)}
                onMouseLeave={hideTip}
              >
                {tierColor && <circle r={R + 3} fill="none" stroke={tierColor} strokeWidth={2.5} />}
                <circle r={R} fill={fill} />
                <Icon x={-9} y={-9} width={18} height={18} color="#FFFFFF" strokeWidth={2} aria-hidden />
                {node.tier && (
                  <text
                    y={-(R + 10)}
                    textAnchor="middle"
                    fill={tierColor ?? 'var(--text-tertiary)'}
                    fontSize={9}
                    fontWeight={700}
                    pointerEvents="none"
                  >
                    {tierLabel(node.tier).toLocaleUpperCase()}
                  </text>
                )}
                <text y={R + 18} textAnchor="middle" fill="var(--text-secondary)" fontSize={10} fontWeight={500} pointerEvents="none">
                  {truncate(node.name, nameChars)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {tooltip && (
        <div
          className="fixed z-50 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-2 text-caption pointer-events-none whitespace-pre-line max-w-[240px]"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12, boxShadow: 'var(--shadow-dropdown)' }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}

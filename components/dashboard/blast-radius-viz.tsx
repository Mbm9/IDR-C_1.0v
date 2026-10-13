'use client'

import { useRef, useEffect, useState } from 'react'
import { isControlPlaneTier } from '@/lib/utils/tiers'

interface BlastNode {
  id: string
  name: string
  type: 'identity' | 'resource' | 'group'
  subType?: string
  tier?: string
  criticality?: string
}

interface Props {
  center: { id: string; name: string; type: string; subType: string; tier: string; riskScore: number }
  rings: { depth: number; nodes: BlastNode[] }[]
}

const NODE_COLORS: Record<string, string> = {
  identity_human: '#3b82f6',
  identity_non_human: '#8b5cf6',
  resource: '#6b7280',
  group: '#eab308',
}

function getNodeColor(node: BlastNode): string {
  if (node.type === 'identity') {
    return node.subType && ['service_account', 'managed_identity', 'app_registration', 'api_key', 'bot', 'machine', 'certificate'].includes(node.subType)
      ? NODE_COLORS.identity_non_human
      : NODE_COLORS.identity_human
  }
  return NODE_COLORS[node.type] || '#6b7280'
}

export function BlastRadiusViz({ center, rings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: BlastNode } | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect
      setDimensions({ width, height: Math.min(600, width * 0.75) })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = dimensions
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const cx = width / 2
    const cy = height / 2
    const maxRadius = Math.min(cx, cy) - 40

    // Clear
    ctx.clearRect(0, 0, width, height)

    // Draw concentric rings
    const ringCount = rings.length
    for (let i = ringCount; i >= 1; i--) {
      const radius = (i / ringCount) * maxRadius
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = `rgba(148, 163, 184, ${0.03 * (ringCount - i + 1)})`
      ctx.fill()
    }

    // Store node positions for hit testing
    const nodePositions: { x: number; y: number; r: number; node: BlastNode }[] = []

    // Draw nodes on each ring
    rings.forEach((ring, ringIdx) => {
      const ringRadius = ((ringIdx + 1) / ringCount) * maxRadius
      const nodes = ring.nodes
      const angleStep = (Math.PI * 2) / Math.max(nodes.length, 1)

      nodes.forEach((node, nodeIdx) => {
        const angle = angleStep * nodeIdx - Math.PI / 2
        const jitter = (Math.random() - 0.5) * 10
        const x = cx + (ringRadius + jitter) * Math.cos(angle)
        const y = cy + (ringRadius + jitter) * Math.sin(angle)
        const nodeRadius = node.type === 'resource' ? 4 : 6

        // T0 / Top Tier highlight ring
        if (isControlPlaneTier(node.tier)) {
          ctx.beginPath()
          ctx.arc(x, y, nodeRadius + 3, 0, Math.PI * 2)
          ctx.strokeStyle = node.tier === 'tier_top' ? '#be123c' : '#ef4444'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        // Node circle
        ctx.beginPath()
        ctx.arc(x, y, nodeRadius, 0, Math.PI * 2)
        ctx.fillStyle = getNodeColor(node)
        ctx.fill()

        // Line from center to node
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(x, y)
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        nodePositions.push({ x, y, r: nodeRadius + 3, node })
      })
    })

    // Draw center node
    ctx.beginPath()
    ctx.arc(cx, cy, 16, 0, Math.PI * 2)
    ctx.fillStyle = center.tier === 'tier_0' ? '#ef4444' : center.tier === 'tier_top' ? '#be123c' : '#3b82f6'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    // Center label
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const shortName = center.name.length > 10 ? center.name.slice(0, 10) + '..' : center.name
    ctx.fillText(shortName, cx, cy)

    // Ring labels
    rings.forEach((ring, idx) => {
      const radius = ((idx + 1) / ringCount) * maxRadius
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`Depth ${ring.depth} (${ring.nodes.length})`, cx, cy - radius - 8)
    })

    // Legend
    const legendItems = [
      { color: NODE_COLORS.identity_human, label: 'Human' },
      { color: NODE_COLORS.identity_non_human, label: 'NHI' },
      { color: NODE_COLORS.resource, label: 'Resource' },
      { color: NODE_COLORS.group, label: 'Group' },
      { color: '#ef4444', label: 'T0 (ring)' },
      { color: '#be123c', label: 'TOP (ring)' },
    ]
    legendItems.forEach((item, idx) => {
      const lx = 16
      const ly = height - (legendItems.length - idx) * 18
      ctx.beginPath()
      ctx.arc(lx, ly, 5, 0, Math.PI * 2)
      ctx.fillStyle = item.color
      ctx.fill()
      ctx.fillStyle = 'rgba(148, 163, 184, 0.8)'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'start'
      ctx.fillText(item.label, lx + 10, ly + 3)
    })

    // Mouse handler for tooltips
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      for (const pos of nodePositions) {
        const dx = mx - pos.x
        const dy = my - pos.y
        if (dx * dx + dy * dy <= pos.r * pos.r * 4) {
          setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, node: pos.node })
          return
        }
      }
      setTooltip(null)
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    return () => canvas.removeEventListener('mousemove', handleMouseMove)
  }, [center, rings, dimensions])

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="w-full"
      />
      {tooltip && (
        <div
          className="absolute bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg shadow-lg p-3 pointer-events-none z-10"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">{tooltip.node.name}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {tooltip.node.type}{tooltip.node.subType ? ` / ${tooltip.node.subType}` : ''}
          </p>
          {tooltip.node.tier && (
            <p className={`text-xs font-medium ${isControlPlaneTier(tooltip.node.tier) ? 'text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))]' : ''}`}>
              {tooltip.node.tier.replace('_', ' ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

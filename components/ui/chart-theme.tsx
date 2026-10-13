'use client'

// Shared charting primitives so every Recharts surface reads as one system:
// token-driven colors, a faint grid, a styled tooltip, gradient area fills, and a
// lightweight hand-drawn sparkline for stat tiles. Colors are CSS-var references so
// they follow light/dark automatically (SVG fill supports var()).

import type { ReactNode } from 'react'

// Semantic + series palette, all via design tokens.
export const CHART = {
  accent: 'var(--color-info)',
  critical: 'var(--color-critical)',
  high: 'var(--color-high)',
  medium: 'var(--color-medium)',
  low: 'var(--color-low)',
  grid: 'var(--border-default)',
  axis: 'var(--text-secondary)',
  human: 'var(--color-human)',
  nhi: 'var(--color-nhi)',
} as const

export const SEVERITY_SERIES: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: CHART.critical, high: CHART.high, medium: CHART.medium, low: CHART.low,
}

// Common axis props — tabular figures, quiet ticks, no axis line.
export const axisProps = {
  tick: { fontSize: 11, fill: 'var(--text-secondary)', style: { fontVariantNumeric: 'tabular-nums' } },
  tickLine: false,
  axisLine: false,
} as const

// CartesianGrid preset: faint horizontal rules only.
export const gridProps = {
  stroke: 'var(--border-default)',
  strokeDasharray: '0',
  vertical: false,
  strokeOpacity: 0.6,
} as const

/** <defs> gradient for an area fill that fades to transparent. Reference by url(#id). */
export function AreaGradient({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.22} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  )
}

/** Token-styled tooltip. Pass a `format` to control each row's value/label. */
export function ChartTooltip({ active, payload, label, labelFormatter, format }: any) {
  if (!active || !payload?.length) return null
  // Charts may sit in a dir="ltr" frame; the tooltip text follows the page direction.
  const dir = typeof document !== 'undefined' ? document.documentElement.dir || 'ltr' : 'ltr'
  const shownLabel = label != null && labelFormatter ? labelFormatter(label, payload) : label
  return (
    <div
      dir={dir}
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
      style={{ boxShadow: 'var(--shadow-dropdown)' }}
    >
      {shownLabel != null && <p className="mb-1 font-medium text-[var(--text-primary)]">{shownLabel}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((p: any, i: number) => {
          const row = format ? format(p) : { name: p.name, value: p.value }
          if (!row) return null
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color || p.fill || 'var(--text-tertiary)' }} aria-hidden="true" />
              <span className="text-[var(--text-secondary)]">{row.name}</span>
              <span className="ms-auto font-semibold tabular-nums text-[var(--text-primary)]">{row.value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Lightweight inline sparkline (pure SVG — no Recharts) for stat tiles.
 * Emphasizes the final point so the current value reads at a glance.
 */
export function Sparkline({
  data, color = 'var(--color-info)', width = 96, height = 28, strokeWidth = 1.5,
}: { data: number[]; color?: string; width?: number; height?: number; strokeWidth?: number }) {
  if (!data || data.length < 2) return <svg width={width} height={height} aria-hidden="true" />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pad = strokeWidth + 1
  const stepX = (width - pad * 2) / (data.length - 1)
  const pts = data.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (1 - (v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  const last = pts[pts.length - 1]
  const gid = `spark-${Math.round(pts[0][1])}-${data.length}-${Math.round(max)}`
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
    </svg>
  )
}

/** Wraps chart content so wide charts never make the page scroll sideways. */
export function ChartFrame({ children, height = 240 }: { children: ReactNode; height?: number }) {
  return <div style={{ width: '100%', height }} className="overflow-x-auto">{children}</div>
}

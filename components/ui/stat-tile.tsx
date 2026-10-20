'use client'

// A denser, more scannable stat tile than MetricCard: severity stripe + count-up
// value + delta chip + inline sparkline. Built for the dashboard "attention band"
// where state must read at a glance. State is encoded in FORM (stripe, arrow,
// color), not number alone.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus, ArrowRight } from 'lucide-react'
import { Sparkline, SEVERITY_SERIES } from './chart-theme'
import { TONE_TEXT } from './tone'

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'neutral'

export interface StatTileProps {
  label: string
  value: number | string
  /** % or absolute change vs the prior period. */
  delta?: number
  /** false (default) = an increase is BAD (e.g. exposures); true = increase is GOOD (compliance). */
  higherIsBetter?: boolean
  deltaSuffix?: string
  severity?: Severity
  spark?: number[]
  href?: string
  hint?: string
  loading?: boolean
}

const STRIPE: Record<Severity, string> = {
  critical: 'var(--color-critical)', high: 'var(--color-high)',
  medium: 'var(--color-medium)', low: 'var(--color-low)', neutral: 'var(--color-info)',
}

function useCountUp(value: number | string) {
  const [display, setDisplay] = useState(typeof value === 'number' ? 0 : value)
  useEffect(() => {
    if (typeof value !== 'number') { setDisplay(value); return }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setDisplay(value); return }
    const dur = 320, t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1)
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * value))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return display
}

export function StatTile(props: StatTileProps) {
  const { label, value, delta, higherIsBetter = false, deltaSuffix = '%', severity = 'neutral', spark, href, hint, loading } = props
  const display = useCountUp(loading ? 0 : value)

  if (loading) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 animate-pulse" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="h-2.5 w-24 rounded bg-[var(--bg-tertiary)] mb-3" />
        <div className="h-7 w-14 rounded bg-[var(--bg-tertiary)]" />
      </div>
    )
  }

  const stripe = STRIPE[severity]
  const sparkColor = severity !== 'neutral' && severity !== 'low' ? (SEVERITY_SERIES as any)[severity] : stripe
  const deltaDir = delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const deltaGood = deltaDir === 'flat' ? null : (deltaDir === 'up') === higherIsBetter
  const DeltaIcon = deltaDir === 'up' ? ArrowUpRight : deltaDir === 'down' ? ArrowDownRight : Minus

  const Wrap: any = href ? Link : 'div'
  const wrapProps = href ? { href } : {}

  return (
    <Wrap
      {...wrapProps}
      className={`group relative block overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 ${href ? 'card-interactive' : ''}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: stripe, boxShadow: `0 0 0 3px color-mix(in srgb, ${stripe} 18%, transparent)` }} aria-hidden="true" />
            <span className="truncate min-w-0">{label}</span>
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[1.75rem] font-semibold tabular-nums tracking-tight text-[var(--text-primary)] leading-none">{display}</span>
            {delta != null && (
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${deltaGood == null ? 'text-[var(--text-secondary)]' : TONE_TEXT[deltaGood ? 'low' : 'critical']}`}
              >
                <DeltaIcon size={12} className="rtl:-scale-x-100" aria-hidden="true" /><bdi>{Math.abs(delta)}{deltaSuffix}</bdi>
              </span>
            )}
          </div>
          {hint && <p className="mt-1 text-[11px] text-[var(--text-secondary)] truncate">{hint}</p>}
        </div>
        {spark && spark.length > 1 && (
          <div className="shrink-0 pt-1"><Sparkline data={spark} color={sparkColor} /></div>
        )}
      </div>
      {href && (
        <ArrowRight size={13} className="absolute end-3 bottom-3 text-[var(--text-tertiary)] opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 rtl:rotate-180" aria-hidden="true" />
      )}
    </Wrap>
  )
}

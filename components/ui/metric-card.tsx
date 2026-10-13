'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { TONE_TEXT } from './tone'

export interface MetricCardProps {
  label: string
  value: number | string
  previousValue?: number
  trend?: 'up' | 'down' | 'flat'
  trendIsPositive?: boolean // true = up is good (compliance), false = up is bad (violations)
  severity?: 'critical' | 'high' | 'medium' | 'low'
  color?: 'red' | 'rose' | 'orange' | 'green' | 'blue' // backward-compat alias for border color; rose = Top Tier
  href?: string
  loading?: boolean
  confidence?: number // 0-100: >= 80 green, 50-79 amber, < 50 red
  subtitle?: string
}

// Accent colour shown as a status dot before the label.
const SEVERITY_ACCENT: Record<string, string> = {
  critical: 'var(--color-critical)',
  high: 'var(--color-high)',
  medium: 'var(--color-medium)',
  low: 'var(--color-low)',
}

const COLOR_ACCENT: Record<string, string> = {
  red: 'var(--color-critical)',
  rose: 'var(--color-tier-top)',
  orange: 'var(--color-high)',
  green: 'var(--color-low)',
  blue: 'var(--color-info)',
}

export function MetricCard({
  label, value, previousValue, trend, trendIsPositive = false,
  severity, color, href, loading, confidence, subtitle,
}: MetricCardProps) {
  const t = useTranslations('ui')
  const [displayValue, setDisplayValue] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof value !== 'number') return
    const duration = 300
    const start = performance.now()
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(eased * value))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [value])

  if (loading) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 animate-pulse" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="h-3 w-20 rounded bg-[var(--bg-tertiary)] mb-3" />
        <div className="h-8 w-16 rounded bg-[var(--bg-tertiary)]" />
      </div>
    )
  }

  const trendDelta = previousValue && typeof value === 'number'
    ? Math.round(((value - previousValue) / previousValue) * 100)
    : null

  const accent = severity ? SEVERITY_ACCENT[severity] : color ? COLOR_ACCENT[color] : null
  const Wrapper = href ? 'a' : 'div'
  const wrapperProps = href ? { href } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={`
        block rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5
        ${href ? 'cursor-pointer card-interactive' : ''}
      `}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <p className="flex items-center gap-1.5 text-caption text-[var(--text-secondary)] font-medium uppercase tracking-wider">
        {accent && (
          <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: accent, boxShadow: `0 0 0 3px color-mix(in srgb, ${accent} 18%, transparent)` }} aria-hidden="true" />
        )}
        {label}
      </p>
      <div className="mt-2.5 flex items-baseline gap-2">
        <p className="text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums text-[var(--text-primary)] animate-count-up">
          {confidence !== undefined && confidence >= 50 && confidence < 80 ? '~' : ''}
          {typeof value === 'number' ? displayValue : value}
        </p>
        {trend && (
          <span className={`flex items-center gap-0.5 text-micro font-medium ${
            (trend === 'up' && trendIsPositive) || (trend === 'down' && !trendIsPositive)
              ? TONE_TEXT.low
              : (trend === 'up' && !trendIsPositive) || (trend === 'down' && trendIsPositive)
                ? TONE_TEXT.critical
                : 'text-[var(--text-secondary)]'
          }`}>
            {trend === 'up' && <TrendingUp size={14} className="rtl:-scale-x-100" aria-hidden="true" />}
            {trend === 'down' && <TrendingDown size={14} className="rtl:-scale-x-100" aria-hidden="true" />}
            {trend === 'flat' && <Minus size={14} aria-hidden="true" />}
            {trendDelta !== null && `${Math.abs(trendDelta)}%`}
          </span>
        )}
      </div>
      {confidence !== undefined && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              backgroundColor: confidence >= 80 ? 'var(--color-low)' : confidence >= 50 ? 'var(--color-medium)' : 'var(--color-critical)',
            }}
            title={confidence >= 80 ? t('highConfidence') : confidence >= 50 ? t('estimated') : t('lowConfidence')}
          />
          {confidence < 50 && (
            <span className={`text-micro font-medium ${TONE_TEXT.critical}`}>{t('lowConfidence')}</span>
          )}
        </div>
      )}
    </Wrapper>
  )
}

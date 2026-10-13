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
  color?: 'red' | 'orange' | 'green' | 'blue' // backward-compat alias for border color
  href?: string
  loading?: boolean
  confidence?: number // 0-100: >= 80 green, 50-79 amber, < 50 red
  subtitle?: string
}

// Logical (start) border so the accent stripe sits on the reading-start side in RTL too.
const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-s-[var(--color-critical)]',
  high: 'border-s-[var(--color-high)]',
  medium: 'border-s-[var(--color-medium)]',
  low: 'border-s-[var(--color-low)]',
}

const COLOR_STYLES: Record<string, string> = {
  red: 'border-s-[var(--color-critical)]',
  orange: 'border-s-[var(--color-high)]',
  green: 'border-s-[var(--color-low)]',
  blue: 'border-s-[var(--color-info)]',
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

  const Wrapper = href ? 'a' : 'div'
  const wrapperProps = href ? { href } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={`
        block rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5
        ${severity ? `border-s-[3px] ${SEVERITY_STYLES[severity]}` : color ? `border-s-[3px] ${COLOR_STYLES[color]}` : ''}
        ${href ? 'cursor-pointer hover:border-[var(--border-hover)] transition-colors' : ''}
      `}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-caption text-[var(--text-secondary)] font-medium uppercase tracking-wider">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-hero text-[var(--text-primary)] animate-count-up">
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

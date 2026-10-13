import { useTranslations } from 'next-intl'
import { toneBadge } from './tone'

interface TierBadgeProps {
  tier: string
  effectiveTier?: string | null
  size?: 'xs' | 'sm' | 'md'
  showViolation?: boolean
}

// Orange and amber are darkened so white text keeps a 4.5:1 contrast ratio.
const TIER_CONFIG: Record<string, { short: string; bg: string; text: string }> = {
  tier_0: { short: 'T0', bg: 'var(--color-critical)', text: '#fff' },
  tier_1: { short: 'T1', bg: 'color-mix(in srgb, var(--color-high) 80%, black)', text: '#fff' },
  tier_2: { short: 'T2', bg: 'var(--color-tier2)', text: '#fff' },
  unclassified: { short: '?', bg: 'color-mix(in srgb, var(--color-unclassified) 75%, black)', text: '#fff' },
}

const SIZE_CLASSES = {
  xs: 'text-[10px] px-1.5 py-0.5',
  sm: 'text-micro px-2 py-0.5',
  md: 'text-caption px-2.5 py-1',
}

export function TierBadge({ tier, effectiveTier, size = 'sm', showViolation = true }: TierBadgeProps) {
  const t = useTranslations('tiers')
  const tUi = useTranslations('ui')
  const key = TIER_CONFIG[tier] ? tier : 'unclassified'
  const config = TIER_CONFIG[key]
  const effectiveConfig = effectiveTier ? TIER_CONFIG[effectiveTier] : null
  const hasViolation = showViolation && effectiveTier && effectiveTier !== tier

  if (hasViolation && effectiveConfig) {
    const label = tUi('tierViolationBadge', { assigned: t(key), effective: t(effectiveTier) })
    return (
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap ${SIZE_CLASSES[size]} rounded-[var(--radius-badge)] font-medium border-2 border-[var(--color-critical)] ${toneBadge('critical')}`}
        title={label}
        aria-label={label}
      >
        {/* Assigned tier first, then the effective tier it reaches; the arrow mirrors in RTL. */}
        <span className="line-through" aria-hidden="true">{config.short}</span>
        <span className="inline-block rtl:-scale-x-100" aria-hidden="true">→</span>
        <span aria-hidden="true">{effectiveConfig.short}</span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap ${SIZE_CLASSES[size]} rounded-[var(--radius-badge)] font-medium`}
      style={{ backgroundColor: config.bg, color: config.text }}
      title={size === 'xs' ? t(key) : undefined}
    >
      {size === 'xs' ? config.short : t(key)}
    </span>
  )
}

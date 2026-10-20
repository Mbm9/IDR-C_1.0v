'use client'

import { useTranslations } from 'next-intl'
import { TONE_TEXT, tierTone, type Tone } from '@/components/ui/tone'
import { AD_TIERS } from '@/lib/utils/tiers'

// Localized, RTL-aware tier distribution bars for the tiering page.

interface TierPyramidProps {
  tierCounts: Record<string, number>
  total: number
}

const TONE_VAR: Record<Tone, string> = {
  critical: 'var(--color-critical)',
  high: 'var(--color-high)',
  medium: 'var(--color-medium)',
  low: 'var(--color-low)',
  info: 'var(--color-info)',
  nhi: 'var(--color-nhi)',
  neutral: 'var(--text-secondary)',
}

export function TierPyramid({ tierCounts, total }: TierPyramidProps) {
  const t = useTranslations('tiering')
  const tTiers = useTranslations('tiers')

  const rows = AD_TIERS
    .map((key) => ({ key, count: tierCounts[key] || 0 }))
    .filter((row) => row.key !== 'unclassified' || row.count > 0)
  const maxCount = Math.max(...rows.map((r) => r.count), 1)

  return (
    <ul className="space-y-3" aria-label={t('tierDistribution')}>
      {rows.map((row) => {
        const tone = tierTone(row.key)
        // Top Tier shares Tier 0's critical tone but keeps its own accent so the two levels stay distinct.
        const accent = row.key === 'tier_top' ? 'var(--color-tier-top)' : TONE_VAR[tone]
        const widthPercent = Math.max(20, (row.count / maxCount) * 100)
        const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : '0'

        return (
          <li key={row.key} className="flex items-center gap-3 sm:gap-4">
            <div className="w-20 shrink-0 text-end">
              <span className={`text-xs font-semibold whitespace-nowrap ${TONE_TEXT[tone]}`}>{tTiers(row.key)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="relative h-10 bg-[var(--bg-secondary)] rounded-lg overflow-hidden">
                <div
                  className="absolute inset-y-0 start-0 rounded-lg transition-all duration-500 flex items-center px-3 border-s-4"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: `color-mix(in srgb, ${accent} 12%, var(--bg-primary))`,
                    borderInlineStartColor: accent,
                  }}
                >
                  <span className={`text-sm font-bold ${TONE_TEXT[tone]}`}>{row.count}</span>
                </div>
              </div>
            </div>
            <div className="w-14 shrink-0 text-end">
              <span className="text-xs text-[var(--text-secondary)]">{t('percentOfTotal', { pct })}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

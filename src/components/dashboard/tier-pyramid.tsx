'use client'

import { useTranslations } from 'next-intl'
import { CLASSIFIED_TIERS } from '@/lib/utils/tiers'

interface TierPyramidProps {
  tierCounts: Record<string, number>
  total: number
}

const TIER_COLOR: Record<string, string> = {
  tier_0: 'var(--color-tier0)',
  tier_top: 'var(--color-tier-top)',
  tier_1: 'var(--color-tier1)',
  tier_2: 'var(--color-info)',
  unclassified: 'var(--text-secondary)',
}
// Text derived from the tier colour, readable on light and dark surfaces.
const textColor = (key: string) => `color-mix(in srgb, ${TIER_COLOR[key]} 65%, var(--text-primary))`

export function TierPyramid({ tierCounts, total }: TierPyramidProps) {
  const tTiers = useTranslations('tiers')
  const keys: string[] = [...CLASSIFIED_TIERS, ...((tierCounts.unclassified || 0) > 0 ? ['unclassified'] : [])]
  const rows = keys.map((key) => ({ key, count: tierCounts[key] || 0 }))
  const maxCount = Math.max(...rows.map((r) => r.count), 1)

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const widthPercent = Math.max(20, (row.count / maxCount) * 100)
        const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : '0'
        return (
          <div key={row.key} className="flex items-center gap-4">
            <div className="w-24 text-end">
              <span className="text-xs font-semibold" style={{ color: textColor(row.key) }}>
                {tTiers(row.key)}
              </span>
            </div>
            <div className="flex-1">
              <div className="relative h-10 bg-[var(--bg-tertiary)] rounded-lg overflow-hidden">
                <div
                  className="absolute inset-y-0 start-0 rounded-lg transition-all duration-500 flex items-center px-3 border-s-4"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: `color-mix(in srgb, ${TIER_COLOR[row.key]} 14%, var(--bg-primary))`,
                    borderColor: TIER_COLOR[row.key],
                  }}
                >
                  <span className="text-sm font-bold" style={{ color: textColor(row.key) }}>
                    {row.count}
                  </span>
                </div>
              </div>
            </div>
            <div className="w-14 text-end">
              <span className="text-xs text-[var(--text-secondary)]">{pct}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

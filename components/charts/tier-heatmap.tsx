'use client'

import { useTranslations } from 'next-intl'
import { TONE_TEXT, tierTone } from '@/components/ui/tone'

interface TierHeatmapProps {
  heatmap: Record<string, Record<string, number>>
}

const TIERS = ['tier_0', 'tier_1', 'tier_2'] as const
const TIER_SHORT = { tier_0: 'T0', tier_1: 'T1', tier_2: 'T2' }
const tierNum = (t: string) => (t === 'tier_0' ? 0 : t === 'tier_1' ? 1 : 2)

// Cell fills are tints of the semantic tokens so they follow light/dark mode.
function getCellColor(identityTier: string, accessTier: string, count: number): string {
  if (count === 0) return 'var(--bg-secondary)'
  const iTier = tierNum(identityTier)
  const aTier = tierNum(accessTier)
  if (iTier === aTier) return 'var(--color-low-bg)' // same tier = compliant
  if (aTier < iTier) {
    // Accessing a more privileged tier = violation; intensity grows with the count.
    const pct = count >= 10 ? 22 : count >= 5 ? 15 : 8
    return `color-mix(in srgb, var(--color-critical) ${pct}%, var(--bg-primary))`
  }
  return 'var(--color-info-bg)' // accessing a lower tier = normal
}

export function TierHeatmap({ heatmap }: TierHeatmapProps) {
  const t = useTranslations('tiering')
  const tTiers = useTranslations('tiers')

  return (
    <div>
      <div className="flex items-center gap-2 mb-3" aria-hidden="true">
        <span className="w-20 sm:w-24 shrink-0" />
        {TIERS.map((col) => (
          <div key={col} className="flex-1 text-center">
            <span className={`text-xs font-semibold ${TONE_TEXT[tierTone(col)]}`}>
              {t('heatmapAccesses', { tier: TIER_SHORT[col] })}
            </span>
          </div>
        ))}
      </div>

      <div role="table" aria-label={t('tierAccessMatrix')}>
        <div role="row" className="sr-only">
          <span role="columnheader">{t('heatmapIdentityTier')}</span>
          {TIERS.map((col) => <span key={col} role="columnheader">{t('heatmapAccesses', { tier: tTiers(col) })}</span>)}
        </div>
        {TIERS.map((row) => (
          <div key={row} role="row" className="flex items-center gap-2 mb-2">
            <div role="rowheader" className="w-20 sm:w-24 shrink-0 text-end pe-2">
              <span className={`text-xs font-semibold whitespace-nowrap ${TONE_TEXT[tierTone(row)]}`}>
                {tTiers(row)}
              </span>
            </div>
            {TIERS.map((col) => {
              const count = heatmap[row]?.[col] || 0
              const isViolation = tierNum(col) < tierNum(row) && count > 0
              const title = t('heatmapCellTitle', { from: tTiers(row), to: tTiers(col), count })

              return (
                <div
                  key={col}
                  role="cell"
                  className="flex-1 h-16 rounded-lg flex items-center justify-center border border-[var(--border-default)]"
                  style={{ backgroundColor: getCellColor(row, col, count) }}
                  title={title}
                  aria-label={isViolation ? `${title} — ${t('heatmapViolation')}` : title}
                >
                  <div className="text-center" aria-hidden="true">
                    <span className={`text-lg font-bold ${isViolation ? TONE_TEXT.critical : count > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                      {count}
                    </span>
                    {isViolation && (
                      <p className={`text-[10px] font-medium ${TONE_TEXT.critical}`}>{t('heatmapViolation')}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded border border-[var(--border-default)]" style={{ backgroundColor: 'var(--color-low-bg)' }} aria-hidden="true" /> {t('heatmapCompliant')}
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded border border-[var(--border-default)]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-critical) 15%, var(--bg-primary))' }} aria-hidden="true" /> {t('heatmapTierViolation')}
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded border border-[var(--border-default)]" style={{ backgroundColor: 'var(--color-info-bg)' }} aria-hidden="true" /> {t('heatmapDownward')}
        </div>
      </div>
    </div>
  )
}

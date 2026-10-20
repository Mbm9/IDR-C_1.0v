'use client'

import { useTranslations } from 'next-intl'

const PHASES = [
  'reconnaissance',
  'initial_access',
  'credential_access',
  'privilege_escalation',
  'lateral_movement',
  'persistence',
  'exfiltration',
  'impact',
] as const

interface KillChainVizProps {
  /** Map of kill chain phase -> count of active threats */
  phaseCounts: Record<string, number>
  /** Called when a phase is clicked */
  onPhaseClick?: (phase: string) => void
  /** Currently selected phase */
  selectedPhase?: string | null
}

export function KillChainViz({ phaseCounts, onPhaseClick, selectedPhase }: KillChainVizProps) {
  const t = useTranslations('threats')

  const maxCount = Math.max(1, ...Object.values(phaseCounts))

  return (
    <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
      <h3 id="kill-chain-title" className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('killChain')}</h3>
      <div className="flex gap-1 overflow-x-auto pb-2" tabIndex={0} role="group" aria-labelledby="kill-chain-title">
        {PHASES.map((phase) => {
          const count = phaseCounts[phase] || 0
          const intensity = count / maxCount
          const isSelected = selectedPhase === phase
          const phaseLabel = t(`killChainPhases.${phase}`)

          return (
            <button
              key={phase}
              onClick={() => onPhaseClick?.(phase)}
              aria-pressed={isSelected}
              aria-label={t('phaseCount', { phase: phaseLabel, count })}
              className={`
                flex-1 min-w-[90px] flex flex-col items-center gap-1 p-3 rounded-lg border transition-all
                ${isSelected
                  ? 'border-[var(--color-info)] bg-[var(--color-info)]/10'
                  : 'border-[var(--border-default)] hover:border-[var(--border-hover)]'
                }
              `}
              style={{
                backgroundColor: isSelected
                  ? undefined
                  : count > 0
                    ? `rgba(239, 68, 68, ${0.05 + intensity * 0.2})`
                    : undefined,
              }}
            >
              <span className="text-[10px] font-medium text-[var(--text-primary)] uppercase tracking-wide text-center leading-tight">
                {phaseLabel}
              </span>
              <span className="text-lg font-bold" style={{ color: count > 0 ? 'color-mix(in srgb, var(--color-critical) 70%, var(--text-primary))' : 'var(--text-secondary)' }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

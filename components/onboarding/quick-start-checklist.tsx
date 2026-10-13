'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

interface OnboardingStatus {
  hasOrganization: boolean
  hasIntegration: boolean
  hasIdentities: boolean
  hasTierViolations: boolean
  hasAIPlan: boolean
  hasTeamMembers: boolean
}

const DISMISS_KEY = 'idr-quickstart-dismissed'

// Step labels: quickStart.steps.<key>; CTA labels: quickStart.cta.<cta>
const STEPS = [
  {
    key: 'account' as const,
    alwaysComplete: true,
    href: null,
    cta: null,
  },
  {
    key: 'hasOrganization' as const,
    alwaysComplete: false,
    href: '/dashboard/settings',
    cta: 'configure',
  },
  {
    key: 'hasIntegration' as const,
    alwaysComplete: false,
    href: '/dashboard/integrations',
    cta: 'connect',
  },
  {
    key: 'hasTierViolations' as const,
    alwaysComplete: false,
    href: '/dashboard/tiering',
    cta: 'review',
  },
  {
    key: 'hasAIPlan' as const,
    alwaysComplete: false,
    href: '/dashboard/ai',
    cta: 'analyze',
  },
  {
    key: 'hasTeamMembers' as const,
    alwaysComplete: false,
    href: '/dashboard/settings',
    cta: 'invite',
  },
] as const

export function QuickStartChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [dismissed, setDismissed] = useState(true) // default hidden until loaded
  const [loading, setLoading] = useState(true)
  const t = useTranslations('quickStart')

  useEffect(() => {
    let wasDismissed = false
    try { wasDismissed = localStorage.getItem(DISMISS_KEY) === 'true' } catch { /* storage unavailable */ }
    setDismissed(wasDismissed)
    if (wasDismissed) {
      setLoading(false)
      return
    }

    fetch('/api/onboarding/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStatus(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (dismissed || loading) return null
  if (!status) return null

  const isComplete = (step: (typeof STEPS)[number]): boolean => {
    if (step.alwaysComplete) return true
    return !!status[step.key as keyof OnboardingStatus]
  }

  const completedCount = STEPS.filter(isComplete).length
  const allDone = completedCount === STEPS.length

  if (allDone) return null

  const progress = Math.round((completedCount / STEPS.length) * 100)

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, 'true') } catch { /* storage unavailable */ }
    setDismissed(true)
  }

  return (
    <div className="px-4 lg:px-6 pt-3">
      <section aria-labelledby="quick-start-title" className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 id="quick-start-title" className="text-body font-semibold text-[var(--text-primary)]">
              {t('title')}
            </h2>
            <p className="text-caption text-[var(--text-secondary)]">
              {t('progress', { done: completedCount, total: STEPS.length })}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={t('dismiss')}
            title={t('dismiss')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-[var(--bg-tertiary)] mb-4" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('title')}>
          <div
            className="h-full rounded-full bg-[var(--color-info)] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps */}
        <ul className="space-y-1.5">
          {STEPS.map((step) => {
            const done = isComplete(step)
            return (
              <li
                key={step.key}
                className={`flex items-center justify-between rounded-md px-3 py-2 transition-colors ${
                  done
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                    : 'bg-[var(--bg-primary)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {done ? (
                    <CheckCircle2
                      size={18}
                      className="text-[var(--color-low)] flex-shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      size={18}
                      className="text-[var(--text-secondary)] flex-shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`text-body ${
                      done
                        ? 'line-through text-[var(--text-secondary)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {done && <span className="sr-only">{t('done')}: </span>}
                    {t(`steps.${step.key}`)}
                  </span>
                </div>

                {!done && step.href && (
                  <Link
                    href={step.href}
                    className="inline-flex items-center gap-1 text-caption font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                  >
                    {step.cta && t(`cta.${step.cta}`)}
                    <ChevronRight size={14} className="rtl:-scale-x-100" aria-hidden="true" />
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

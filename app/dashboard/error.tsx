'use client'

import { useTranslations } from 'next-intl'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { TONE_TEXT } from '@/components/ui/tone'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('dashboardShell')
  const tCommon = useTranslations('common')
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="rounded-[var(--radius-card)] border p-8 max-w-md text-center" style={{ borderColor: 'var(--color-critical)', backgroundColor: 'var(--color-critical-bg)' }} role="alert">
        <AlertTriangle size={32} className="mx-auto mb-3" style={{ color: 'var(--color-critical)' }} aria-hidden="true" />
        <h2 className={`text-heading font-semibold mb-2 ${TONE_TEXT.critical}`}>
          {tCommon('error')}
        </h2>
        <p className="text-caption mb-4 text-[var(--text-primary)] break-words">
          {error.message || t('unexpectedError')}
        </p>
        <button
          onClick={reset}
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-button)] text-body font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-critical) 85%, black)' }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {tCommon('tryAgain')}
        </button>
      </div>
    </div>
  )
}

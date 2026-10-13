'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Keyboard } from 'lucide-react'
import { useTranslations } from 'next-intl'

// group / description are message keys under `shortcuts`
const SHORTCUTS = [
  {
    group: 'navigation',
    items: [
      { keys: ['G', 'D'], description: 'goToDashboard' },
      { keys: ['G', 'I'], description: 'goToIdentities' },
      { keys: ['G', 'V'], description: 'goToViolations' },
      { keys: ['G', 'T'], description: 'goToThreats' },
      { keys: ['G', 'S'], description: 'goToSettings' },
      { keys: ['G', 'C'], description: 'goToCompliance' },
      { keys: ['G', 'R'], description: 'goToRemediation' },
    ],
  },
  {
    group: 'actions',
    items: [
      { keys: ['\u2318', 'K'], description: 'openPalette' },
      { keys: ['Esc'], description: 'closeDialog' },
    ],
  },
  {
    group: 'help',
    items: [
      { keys: ['?'], description: 'showHelp' },
    ],
  },
] as const

export function ShortcutsHelpDialog() {
  const [open, setOpen] = useState(false)
  const t = useTranslations('shortcuts')

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger in inputs
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      setOpen(prev => !prev)
    }
    if (e.key === 'Escape' && open) {
      setOpen(false)
    }
  }, [open])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />

      {/* Dialog */}
      <div role="dialog" aria-modal="true" aria-labelledby="shortcuts-dialog-title" className="relative bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-[var(--color-info)]" aria-hidden="true" />
            <h2 id="shortcuts-dialog-title" className="text-base font-semibold text-[var(--text-primary)]">{t('title')}</h2>
          </div>
          <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" aria-label={t('close')} title={t('close')}>
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {SHORTCUTS.map(section => (
            <div key={section.group}>
              <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                {t(section.group)}
              </h3>
              <div className="space-y-1.5">
                {section.items.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-primary)]">{t(shortcut.description)}</span>
                    <div className="flex items-center gap-1" dir="ltr">
                      {shortcut.keys.map((key, j) => (
                        <span key={j}>
                          {j > 0 && <span className="text-[var(--text-secondary)] text-xs mx-0.5">{t('then')}</span>}
                          <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-mono font-medium">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-default)] bg-[var(--bg-secondary)]">
          <p className="text-[11px] text-[var(--text-secondary)] text-center">
            {t.rich('toggleHint', { key: (chunks) => <kbd className="px-1 py-0.5 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] text-[11px] font-mono">{chunks}</kbd> })}
          </p>
        </div>
      </div>
    </div>
  )
}

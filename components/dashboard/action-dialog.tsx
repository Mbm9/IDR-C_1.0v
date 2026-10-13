'use client'

import { useEffect, useId, useRef } from 'react'
import { useTranslations } from 'next-intl'

interface ActionDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children?: React.ReactNode
  onConfirm: () => void
  confirmLabel?: string
  confirmVariant?: 'default' | 'destructive'
  loading?: boolean
}

export function ActionDialog({
  isOpen,
  onClose,
  title,
  children,
  onConfirm,
  confirmLabel,
  confirmVariant = 'default',
  loading = false,
}: ActionDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const t = useTranslations('actionDialog')

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative bg-[var(--bg-primary)] text-[var(--text-primary)] rounded-xl shadow-xl border border-[var(--border-default)] w-full max-w-md mx-4 p-6 focus:outline-none"
      >
        <h2 id={titleId} className="text-lg font-semibold text-[var(--text-primary)] mb-4">{title}</h2>

        <div className="space-y-4">
          {children}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              confirmVariant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? t('processing') : (confirmLabel ?? t('confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}

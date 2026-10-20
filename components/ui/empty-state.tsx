import { Shield, Users, AlertTriangle, Plug, Brain, ClipboardCheck, FileSearch, Radio } from 'lucide-react'
import Link from 'next/link'

interface EmptyStateProps {
  icon?: 'identities' | 'violations' | 'certifications' | 'integrations' | 'ai' | 'search' | 'sessions' | 'default'
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
}

const ICONS = {
  identities: Users,
  violations: Shield,
  certifications: ClipboardCheck,
  integrations: Plug,
  ai: Brain,
  search: FileSearch,
  sessions: Radio,
  default: FileSearch,
}

export function EmptyState({ icon = 'default', title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  const Icon = ICONS[icon]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
        <Icon size={28} className="text-[var(--text-tertiary)]" aria-hidden="true" />
      </div>
      <h3 className="text-heading text-[var(--text-primary)] mb-1">{title}</h3>
      <p className="text-caption text-[var(--text-secondary)] max-w-sm">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        actionHref ? (
          <Link
            href={actionHref}
            className="mt-4 px-4 py-2 text-micro font-medium rounded-[var(--radius-button)] bg-[var(--color-info)] text-white hover:opacity-90 transition-opacity"
          >
            {actionLabel}
          </Link>
        ) : (
          <button
            onClick={onAction}
            className="mt-4 px-4 py-2 text-micro font-medium rounded-[var(--radius-button)] bg-[var(--color-info)] text-white hover:opacity-90 transition-opacity"
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  )
}

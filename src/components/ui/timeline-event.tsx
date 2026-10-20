'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface TimelineEventProps {
  events: Array<{
    id: string
    actionType: string
    actorName?: string | null
    rationale?: string | null
    source: string
    createdAt: string
    payload?: any
  }>
  loading?: boolean
}

const ACTION_COLORS: Record<string, string> = {
  certify_entitlement: 'var(--color-low)',
  revoke_access: 'var(--color-critical)',
  approve_exception: 'var(--color-info)',
  escalate_risk: 'var(--color-high)',
  trigger_review: 'var(--color-info)',
  update_tier: 'var(--color-medium)',
  sync_source: 'var(--text-tertiary)',
  generate_recommendation: 'var(--color-nhi)',
  acknowledge_violation: 'var(--color-medium)',
}

const SOURCE_STYLES: Record<string, { bg: string; text: string }> = {
  manual: { bg: 'var(--color-info-bg)', text: 'var(--color-info)' },
  automated: { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' },
  ai_recommended: { bg: '#F5F3FF', text: 'var(--color-nhi)' },
}

function formatAction(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function Timeline({ events, loading }: TimelineEventProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--bg-tertiary)] mt-1.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-32 rounded bg-[var(--bg-tertiary)] mb-1" />
              <div className="h-3 w-48 rounded bg-[var(--bg-tertiary)]" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!events?.length) {
    return <p className="text-caption text-[var(--text-tertiary)] text-center py-8">No activity recorded</p>
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[var(--border-default)]" />

      <div className="space-y-4">
        {events.map((event) => {
          const dotColor = ACTION_COLORS[event.actionType] || 'var(--text-tertiary)'
          const sourceStyle = SOURCE_STYLES[event.source] || SOURCE_STYLES.manual

          return <TimelineItem key={event.id} event={event} dotColor={dotColor} sourceStyle={sourceStyle} />
        })}
      </div>
    </div>
  )
}

function TimelineItem({ event, dotColor, sourceStyle }: {
  event: TimelineEventProps['events'][0]
  dotColor: string
  sourceStyle: { bg: string; text: string }
}) {
  const [showPayload, setShowPayload] = useState(false)

  return (
    <div className="flex gap-3 relative">
      <div
        className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 z-10"
        style={{ backgroundColor: dotColor }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body font-medium text-[var(--text-primary)]">
            {formatAction(event.actionType)}
          </span>
          <span
            className="text-micro px-1.5 py-0.5 rounded-[var(--radius-badge)] font-medium"
            style={{ backgroundColor: sourceStyle.bg, color: sourceStyle.text }}
          >
            {event.source}
          </span>
          <span className="text-caption text-[var(--text-tertiary)]" title={new Date(event.createdAt).toLocaleString()}>
            {timeAgo(event.createdAt)}
          </span>
        </div>
        {event.actorName && (
          <p className="text-caption text-[var(--text-secondary)]">by {event.actorName}</p>
        )}
        {event.rationale && (
          <p className="text-caption text-[var(--text-primary)] mt-0.5">{event.rationale}</p>
        )}
        {event.payload && Object.keys(event.payload).length > 0 && (
          <button
            onClick={() => setShowPayload(!showPayload)}
            className="flex items-center gap-1 text-micro text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mt-1"
          >
            <ChevronDown size={12} className={showPayload ? 'rotate-180' : ''} />
            Details
          </button>
        )}
        {showPayload && event.payload && (
          <pre className="mt-1 p-2 text-micro bg-[var(--bg-tertiary)] rounded-[var(--radius-badge)] overflow-x-auto font-mono">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

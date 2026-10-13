'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Shield, UserX, Clock, Key, Lock } from 'lucide-react'
import { TierBadge } from './tier-badge'
import Link from 'next/link'

interface ViolationCardProps {
  violation: {
    id: string
    violationType: string
    severity: string
    status: string
    detectedAt: string
    policyName?: string | null
    identityId?: string | null
    identityName?: string | null
    exceptionReason?: string | null
    exceptionExpiresAt?: string | null
  }
  onAction?: (action: string, violationId: string) => void
  userRole?: string
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'var(--color-critical)',
  high: 'var(--color-high)',
  medium: 'var(--color-medium)',
  low: 'var(--color-low)',
}

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  tier_breach: Shield,
  sod_conflict: Key,
  excessive_privilege: Key,
  dormant_access: Clock,
  orphaned_identity: UserX,
  missing_mfa: Lock,
  expired_certification: Clock,
  password_age: Lock,
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  open: { bg: 'var(--color-critical-bg)', text: 'var(--color-critical)' },
  acknowledged: { bg: 'var(--color-medium-bg)', text: 'var(--color-medium)' },
  remediated: { bg: 'var(--color-low-bg)', text: 'var(--color-low)' },
  excepted: { bg: 'var(--color-info-bg)', text: 'var(--color-info)' },
  false_positive: { bg: 'var(--bg-tertiary)', text: 'var(--text-tertiary)' },
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function ViolationCard({ violation, onAction, userRole }: ViolationCardProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TYPE_ICONS[violation.violationType] || AlertTriangle
  const borderColor = SEVERITY_BORDER[violation.severity] || SEVERITY_BORDER.medium
  const statusStyle = STATUS_STYLES[violation.status] || STATUS_STYLES.open

  return (
    <div
      className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] overflow-hidden"
      style={{ borderLeftWidth: '3px', borderLeftColor: borderColor, boxShadow: 'var(--shadow-card)' }}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon size={18} style={{ color: borderColor }} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body font-medium text-[var(--text-primary)]">
              {formatType(violation.violationType)}
            </span>
            <span
              className="text-micro px-2 py-0.5 rounded-[var(--radius-badge)] font-medium capitalize"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
            >
              {violation.status.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {violation.identityName && violation.identityId && (
              <Link
                href={`/dashboard/identities/${violation.identityId}`}
                className="text-caption text-[var(--color-info-text)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {violation.identityName}
              </Link>
            )}
            <span className="text-caption text-[var(--text-tertiary)]">
              {timeAgo(violation.detectedAt)}
            </span>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={16} className="text-[var(--text-tertiary)]" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--border-default)] pt-3 space-y-2">
          {violation.policyName && (
            <p className="text-caption"><span className="text-[var(--text-tertiary)]">Policy:</span> {violation.policyName}</p>
          )}
          {violation.exceptionReason && (
            <p className="text-caption"><span className="text-[var(--text-tertiary)]">Exception:</span> {violation.exceptionReason}</p>
          )}
          {onAction && violation.status === 'open' && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onAction('acknowledge', violation.id)}
                className="text-micro px-3 py-1.5 rounded-[var(--radius-button)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-colors"
              >
                Acknowledge
              </button>
              {userRole && ['ciso', 'admin'].includes(userRole) && (
                <button
                  onClick={() => onAction('exception', violation.id)}
                  className="text-micro px-3 py-1.5 rounded-[var(--radius-button)] bg-[var(--color-info-bg)] text-[var(--color-info-text)] hover:opacity-80 transition-opacity"
                >
                  Create Exception
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

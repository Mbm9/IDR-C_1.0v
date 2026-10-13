'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { TierBadge } from '@/components/ui/tier-badge'
import { Shield, AlertTriangle, User, Bot, ExternalLink } from 'lucide-react'

interface IdentityResult {
  id: string
  displayName: string
  type?: string
  subType?: string
  adTier?: string
  effectiveTier?: string
  tierViolation?: boolean
  riskScore?: number
  status?: string
  lastLogonAt?: string
}

interface ViolationResult {
  id: string
  violationType: string
  severity: string
  status: string
  identityName?: string
  identityId?: string
  identityTier?: string
}

function getRiskColor(score: number): string {
  if (score >= 80) return 'var(--color-critical)'
  if (score >= 60) return 'var(--color-high)'
  if (score >= 30) return 'var(--color-medium)'
  return 'var(--color-low)'
}

function RiskBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: getRiskColor(score) }}
        />
      </div>
      <span className="text-micro font-mono font-medium text-[var(--text-primary)]">
        {score}
      </span>
    </div>
  )
}

function IdentityCard({ identity }: { identity: IdentityResult }) {
  const t = useTranslations('aiChat')
  const tStatus = useTranslations('status')
  const format = useFormatter()
  const statusKeys = ['active', 'inactive', 'disabled', 'dormant', 'orphaned', 'suspended']
  return (
    <Link
      href={`/dashboard/identities/${identity.id}`}
      className="block p-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] hover:border-[var(--border-hover)] transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg-tertiary)]">
            {identity.type === 'non_human' ? <Bot size={12} className="text-[var(--text-secondary)]" aria-hidden="true" /> : <User size={12} className="text-[var(--text-secondary)]" aria-hidden="true" />}
          </div>
          <bdi className="text-caption font-medium text-[var(--text-primary)] truncate max-w-[180px]">
            {identity.displayName}
          </bdi>
        </div>
        <ExternalLink size={12} className="text-[var(--text-secondary)] rtl:-scale-x-100" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        {identity.adTier && (
          <TierBadge
            tier={identity.adTier}
            effectiveTier={identity.tierViolation ? identity.effectiveTier : null}
            size="xs"
          />
        )}
        {identity.status && (
          <span className="text-micro text-[var(--text-secondary)]">{statusKeys.includes(identity.status) ? tStatus(identity.status as 'active') : identity.status}</span>
        )}
      </div>
      {identity.riskScore !== undefined && <RiskBar score={identity.riskScore} />}
      {identity.lastLogonAt && (
        <p className="text-micro text-[var(--text-secondary)] mt-1">
          {t('lastLogon', { date: format.dateTime(new Date(identity.lastLogonAt), { dateStyle: 'medium' }) })}
        </p>
      )}
    </Link>
  )
}

function ViolationCard({ violation }: { violation: ViolationResult }) {
  const t = useTranslations('aiChat')
  const tSeverity = useTranslations('severity')
  const tTiers = useTranslations('tiers')
  const severityColors: Record<string, string> = {
    critical: 'var(--color-critical)',
    high: 'var(--color-high)',
    medium: 'var(--color-medium)',
    low: 'var(--color-low)',
  }

  return (
    <div className="p-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)]">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={14} style={{ color: severityColors[violation.severity] || 'var(--text-secondary)' }} aria-hidden="true" />
        <bdi className="text-caption font-medium text-[var(--text-primary)] capitalize" dir="ltr">
          {violation.violationType.replace(/_/g, ' ')}
        </bdi>
        <span
          className="text-micro px-1.5 py-0.5 rounded font-medium border text-[var(--text-primary)]"
          style={{ borderColor: severityColors[violation.severity] || 'var(--border-hover)' }}
        >
          {severityColors[violation.severity] ? tSeverity(violation.severity as 'critical') : violation.severity}
        </span>
      </div>
      {violation.identityName && (
        <p className="text-micro text-[var(--text-secondary)]">
          {t('identityLabel')} <bdi>{violation.identityName}</bdi>
          {violation.identityTier && ['tier_0', 'tier_1', 'tier_2', 'unclassified'].includes(violation.identityTier) && ` (${tTiers(violation.identityTier as 'tier_0')})`}
        </p>
      )}
    </div>
  )
}

function CountCard({ count, label }: { count: number; label: string }) {
  return (
    <div className="p-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] text-center">
      <p className="text-heading font-semibold text-[var(--text-primary)]">{count}</p>
      <p className="text-micro text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}

interface ChatResultCardProps {
  data: any
}

export function ChatResultCard({ data }: ChatResultCardProps) {
  const t = useTranslations('aiChat')

  if (!data) return null

  // Count result
  if (data.count !== undefined && !Array.isArray(data)) {
    return <CountCard count={data.count} label={t('resultsFound', { count: data.count })} />
  }

  // Array of results
  if (Array.isArray(data) && data.length > 0) {
    const sample = data[0]

    // Identity results (have displayName)
    if (sample.displayName) {
      return (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pe-1" tabIndex={0}>
          {data.slice(0, 5).map((item: IdentityResult) => (
            <IdentityCard key={item.id} identity={item} />
          ))}
          {data.length > 5 && (
            <p className="text-micro text-[var(--text-secondary)] text-center py-1">
              {t('moreResults', { count: data.length - 5 })}
            </p>
          )}
        </div>
      )
    }

    // Violation results (have violationType)
    if (sample.violationType) {
      return (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pe-1" tabIndex={0}>
          {data.slice(0, 5).map((item: ViolationResult) => (
            <ViolationCard key={item.id} violation={item} />
          ))}
          {data.length > 5 && (
            <p className="text-micro text-[var(--text-secondary)] text-center py-1">
              {t('moreResults', { count: data.length - 5 })}
            </p>
          )}
        </div>
      )
    }

    // Generic table for other data
    return (
      <div className="overflow-x-auto">
        <div className="text-micro text-[var(--text-secondary)] p-2 bg-[var(--bg-secondary)] rounded-md border border-[var(--border-default)]">
          <p className="font-medium mb-1">{t('resultsFound', { count: data.length })}</p>
          <pre className="whitespace-pre-wrap text-[10px] max-h-[200px] overflow-y-auto" dir="ltr" tabIndex={0}>
            {JSON.stringify(data.slice(0, 5), null, 2)}
          </pre>
        </div>
      </div>
    )
  }

  return null
}

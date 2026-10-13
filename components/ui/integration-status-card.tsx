'use client'

import { Cloud, Server, Shield, Compass, Key, Database } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { integrationBrandName } from '@/lib/connectors/brand-names'

interface IntegrationStatusCardProps {
  integration: {
    id: string
    name: string
    type: string
    syncStatus: string
    lastSyncAt: string | null
    lastSyncRecordCount: number
    syncFrequencyMinutes: number
    lastSyncError?: string | null
  }
  onSync?: (id: string) => void
}

const SOURCE_ICONS: Record<string, typeof Server> = {
  active_directory: Server,
  azure_ad: Cloud,
  okta: Shield,
  sailpoint: Compass,
  cyberark: Key,
  azure_logs: Cloud,
  sso_provider: Shield,
}

const STATUS_CONFIG: Record<string, { color: string; pulse?: boolean }> = {
  connected: { color: 'var(--color-low)' },
  syncing: { color: 'var(--color-info)', pulse: true },
  error: { color: 'var(--color-critical)' },
  disconnected: { color: 'var(--text-tertiary)' },
}

function isStale(lastSync: string | null, frequency: number): boolean {
  if (!lastSync) return true
  const elapsed = Date.now() - new Date(lastSync).getTime()
  return elapsed > frequency * 60 * 1000 * 2
}

export function IntegrationStatusCard({ integration, onSync }: IntegrationStatusCardProps) {
  const t = useTranslations('integrations')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const Icon = SOURCE_ICONS[integration.type] || Database
  const statusKey = integration.syncStatus in STATUS_CONFIG ? integration.syncStatus : 'disconnected'
  const status = STATUS_CONFIG[statusKey]
  const stale = isStale(integration.lastSyncAt, integration.syncFrequencyMinutes)
  const lastSync = integration.lastSyncAt
    ? format.relativeTime(new Date(integration.lastSyncAt), Date.now())
    : tCommon('never')
  const frequency = integration.syncFrequencyMinutes % 60 === 0
    ? t('everyHours', { count: integration.syncFrequencyMinutes / 60 })
    : t('everyMinutes', { count: integration.syncFrequencyMinutes })

  return (
    <div
      className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
            <Icon size={20} className="text-[var(--text-secondary)]" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-body font-medium text-[var(--text-primary)]"><bdi>{integration.name}</bdi></h3>
            <p className="text-caption text-[var(--text-secondary)]"><bdi>{integrationBrandName(integration.type)}</bdi></p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${status.pulse ? 'animate-pulse-dot' : ''}`}
            style={{ backgroundColor: status.color }}
            aria-hidden="true"
          />
          <span className="text-micro font-medium text-[var(--text-primary)]">{t(`statuses.${statusKey as 'connected'}`)}</span>
        </div>
      </div>

      {statusKey === 'error' && (
        <p className="mb-3 text-micro text-[var(--text-primary)] break-words" dir="auto">
          {integration.lastSyncError ? <bdi>{integration.lastSyncError}</bdi> : t('errorUnknown')}
        </p>
      )}

      {stale && statusKey !== 'disconnected' && (
        <div className="mb-3 px-3 py-2 rounded-[var(--radius-badge)] text-micro font-medium" style={{ backgroundColor: 'var(--color-medium-bg)', color: 'var(--text-primary)' }}>
          {t('statusCard.overdue', { time: lastSync })}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 text-caption">
        <div>
          <dt className="text-[var(--text-secondary)]">{t('lastSync')}</dt>
          <dd className="text-[var(--text-primary)] font-medium">{lastSync}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-secondary)]">{t('records')}</dt>
          <dd className="text-[var(--text-primary)] font-medium">{format.number(integration.lastSyncRecordCount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-secondary)]">{t('frequency')}</dt>
          <dd className="text-[var(--text-primary)] font-medium">{frequency}</dd>
        </div>
      </dl>

      {onSync && (
        <button
          onClick={() => onSync(integration.id)}
          className="mt-4 w-full py-2 text-micro font-medium rounded-[var(--radius-button)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border-default)] transition-colors"
        >
          {t('statusCard.syncNow')}
        </button>
      )}
    </div>
  )
}

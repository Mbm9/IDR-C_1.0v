'use client'

import { useFormatter, useTranslations } from 'next-intl'

interface IntegrationHealth {
  id: string
  name: string
  type: string
  syncStatus: string
  lastSyncAt: string | null
}

interface IntegrationHealthStripProps {
  integrations: IntegrationHealth[]
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'var(--color-low)',
  syncing: 'var(--color-info)',
  error: 'var(--color-critical)',
  disconnected: 'var(--text-tertiary)',
}

export function IntegrationHealthStrip({ integrations }: IntegrationHealthStripProps) {
  const t = useTranslations('integrations')
  const format = useFormatter()

  if (!integrations || integrations.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">{t('healthStrip.none')}</p>
    )
  }

  return (
    <ul className="flex flex-wrap gap-3">
      {integrations.map((integration) => {
        const status = integration.syncStatus in STATUS_COLORS ? integration.syncStatus : 'disconnected'
        return (
          <li
            key={integration.id}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-default)]"
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: STATUS_COLORS[status] }}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]"><bdi>{integration.name}</bdi></p>
              <p className="text-xs text-[var(--text-secondary)]">
                <span className="sr-only">{t(`statuses.${status as 'connected'}`)} · </span>
                {integration.lastSyncAt
                  ? t('healthStrip.synced', { time: format.relativeTime(new Date(integration.lastSyncAt), Date.now()) })
                  : t('healthStrip.neverSynced')}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

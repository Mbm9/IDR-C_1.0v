'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { AlertTriangle, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { IntegrationWizard, type ExistingIntegration } from '@/components/dashboard/integration-wizard'
import { integrationBrandName } from '@/lib/connectors/brand-names'
import { useRoleHint } from '@/lib/hooks/use-role-hint'

interface IntegrationSource {
  id: string
  name: string
  type: string
  syncStatus: 'connected' | 'syncing' | 'error' | 'disconnected'
  lastSyncAt: string | null
  lastSyncRecordCount: number | null
  lastSyncError: string | null
  syncFrequencyMinutes: number
  hasCredentials: boolean
}

const STATUS_COLORS: Record<IntegrationSource['syncStatus'], string> = {
  connected: 'var(--color-low)',
  syncing: 'var(--color-info)',
  error: 'var(--color-critical)',
  disconnected: 'var(--text-tertiary)',
}

/** Connected integration sources: status, sync and setup. Shown in Settings → Integrations. */
export function IntegrationsPanel() {
  const queryClient = useQueryClient()
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({})
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<ExistingIntegration | null>(null)
  const t = useTranslations('integrations')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const { can, hint, roleName } = useRoleHint()
  const canManage = can('iam_admin')

  const { data, isLoading, isError, refetch } = useQuery<{ sources: IntegrationSource[] }>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  async function handleSync(source: Pick<IntegrationSource, 'id' | 'type'>) {
    setSyncingIds(prev => new Set(prev).add(source.id))
    setSyncErrors(prev => {
      const next = { ...prev }
      delete next[source.id]
      return next
    })
    try {
      const res = await fetch(`/api/sync/${source.type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId: source.id }),
      })
      if (!res.ok && res.status !== 500) {
        // 500 = the sync ran and failed; the reason is stored on the source and shown on the card.
        const err = await res.json().catch(() => ({}))
        setSyncErrors(prev => ({ ...prev, [source.id]: err.error || t('syncRequestFailed') }))
      }
    } catch {
      setSyncErrors(prev => ({ ...prev, [source.id]: t('syncRequestFailed') }))
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setSyncingIds(prev => {
        const next = new Set(prev)
        next.delete(source.id)
        return next
      })
    }
  }

  function handleWizardDone(saved?: { id: string; type: string }) {
    queryClient.invalidateQueries({ queryKey: ['integrations'] })
    // New and reconnected sources sync straight away ("Save & Start First Sync" / "Save & Sync"),
    // so the card shows real status — or the failure reason — immediately.
    if (saved) handleSync(saved)
  }

  function frequencyLabel(minutes: number) {
    return minutes % 60 === 0
      ? t('everyHours', { count: minutes / 60 })
      : t('everyMinutes', { count: minutes })
  }

  const connectButton = (
    <button
      onClick={() => { setEditing(null); setWizardOpen(true) }}
      disabled={!canManage}
      title={canManage ? undefined : hint('iam_admin')}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--color-info)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Plus className="w-4 h-4" aria-hidden="true" />
      {t('connectNew')}
    </button>
  )

  if (isError) {
    return (
      <div className="space-y-6">
        <h3 className="text-heading text-[var(--text-primary)]">{t('title')}</h3>
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-6 text-sm text-[var(--text-secondary)]">
          <p>{tCommon('error')}</p>
          <button onClick={() => refetch()} className="mt-3 text-[var(--color-info-text)] underline">{tCommon('tryAgain')}</button>
        </div>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h3 className="text-heading text-[var(--text-primary)]">{t('title')}</h3>
        <div className="animate-pulse space-y-4" role="status" aria-busy="true" aria-label={tCommon('loading')}>
          {[1, 2, 3].map(i => <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-32" />)}
        </div>
      </div>
    )
  }

  const errorCount = data.sources.filter(s => s.syncStatus === 'error').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-heading text-[var(--text-primary)]">{t('title')}</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            {t('summary', { count: data.sources.length, errors: errorCount })}
          </p>
        </div>
        {connectButton}
      </div>

      {data.sources.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--text-secondary)]">
          {t('empty')}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {data.sources.map((source) => {
          const isSyncing = syncingIds.has(source.id) || source.syncStatus === 'syncing'
          const status = isSyncing ? 'syncing' : source.syncStatus
          const color = STATUS_COLORS[status] ?? STATUS_COLORS.disconnected
          const requestError = syncErrors[source.id]
          const brand = integrationBrandName(source.type)
          return (
            <div
              key={source.id}
              className="flex flex-col bg-[var(--bg-primary)] rounded-xl border p-6"
              style={{ boxShadow: 'var(--shadow-card)', borderColor: status === 'error' ? 'var(--color-critical)' : 'var(--border-default)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] min-w-0 break-words"><bdi>{source.name}</bdi></h4>
                <span
                  className="flex shrink-0 items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
                  style={{ color: 'var(--text-primary)', borderColor: color }}
                >
                  <span className={`shrink-0 w-2 h-2 rounded-full ${isSyncing ? 'animate-pulse' : ''}`} style={{ backgroundColor: color }} aria-hidden="true" />
                  {t(`statuses.${status}`)}
                </span>
              </div>

              {status === 'error' && (
                <div
                  className="mb-4 rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: 'var(--color-critical)', backgroundColor: 'var(--bg-secondary)' }}
                  role="status"
                >
                  <p className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-critical-text)' }} aria-hidden="true" />
                    {t('errorTitle')}
                  </p>
                  <p className="mt-1 text-[var(--text-primary)] break-words" dir="auto">
                    {source.lastSyncError ? <bdi>{source.lastSyncError}</bdi> : t('errorUnknown')}
                  </p>
                  <p className="mt-1.5 text-[var(--text-secondary)]">
                    {canManage ? t('errorGuidance') : t('errorGuidanceViewer', { role: roleName('iam_admin') })}
                  </p>
                </div>
              )}

              {requestError && (
                <p className="mb-3 text-xs" style={{ color: 'var(--color-critical-text)' }} role="alert"><bdi>{requestError}</bdi></p>
              )}

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-secondary)]">{t('type')}</dt>
                  <dd className="text-[var(--text-primary)] text-end"><bdi>{brand}</bdi></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-secondary)]">{t('lastSync')}</dt>
                  <dd className="text-[var(--text-primary)] text-end">
                    {source.lastSyncAt
                      ? <time dateTime={source.lastSyncAt} title={format.dateTime(new Date(source.lastSyncAt), { dateStyle: 'medium', timeStyle: 'short' })}>{format.relativeTime(new Date(source.lastSyncAt), Date.now())}</time>
                      : tCommon('never')}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-secondary)]">{t('records')}</dt>
                  <dd className="text-[var(--text-primary)] text-end">{format.number(source.lastSyncRecordCount ?? 0)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-secondary)]">{t('frequency')}</dt>
                  <dd className="text-[var(--text-primary)] text-end">{frequencyLabel(source.syncFrequencyMinutes)}</dd>
                </div>
              </dl>

              {canManage && (
                <div className="mt-auto pt-4 flex gap-2">
                  <button
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2 text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSyncing}
                    onClick={() => handleSync(source)}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {isSyncing ? t('syncing') : status === 'error' ? t('retrySync') : t('triggerSync')}
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--text-primary)] rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
                    disabled={isSyncing}
                    onClick={() => { setEditing({ id: source.id, name: source.name, type: source.type }); setWizardOpen(true) }}
                  >
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {status === 'error' ? t('reconnect') : tCommon('edit')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <IntegrationWizard
        isOpen={wizardOpen}
        existing={editing}
        onClose={() => { setWizardOpen(false); setEditing(null) }}
        onCreated={handleWizardDone}
      />
    </div>
  )
}

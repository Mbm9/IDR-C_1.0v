'use client'

import { useState, useEffect, useCallback } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronDown, Lock } from 'lucide-react'
import { MetricCard } from '@/components/ui/metric-card'
import { useRoleHint } from '@/lib/hooks/use-role-hint'

interface Canary {
  id: string
  identityId: string
  identityName: string
  canaryType: string
  description: string
  placementLocation: string
  enabled: boolean
  triggerCount: number
  lastTriggeredAt: string | null
  lastTriggeredSourceIp: string | null
  createdAt: string
}

interface CreateCanaryForm {
  canaryType: string
  name: string
  description: string
  placementLocation: string
  alertWebhookUrl: string
}

export default function CanariesPage() {
  const t = useTranslations('canaries')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const { can, hint } = useRoleHint()
  const canManage = can('iam_admin')
  const [createError, setCreateError] = useState<string | null>(null)

  const [canaries, setCanaries] = useState<Canary[]>([])
  const [stats, setStats] = useState({ total: 0, active: 0, triggeredEver: 0, triggered24h: 0 })
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [triggers, setTriggers] = useState<Record<string, any[]>>({})

  const [form, setForm] = useState<CreateCanaryForm>({
    canaryType: 'fake_admin',
    name: '',
    description: '',
    placementLocation: '',
    alertWebhookUrl: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/canaries')
      if (res.ok) {
        const data = await res.json()
        setCanaries(data.items || [])
        setStats(data.stats || { total: 0, active: 0, triggeredEver: 0, triggered24h: 0 })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const createCanary = useCallback(async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/canaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowCreate(false)
        setForm({ canaryType: 'fake_admin', name: '', description: '', placementLocation: '', alertWebhookUrl: '' })
        await fetchData()
      } else {
        const body = await res.json().catch(() => ({}))
        setCreateError(body.error || t('deployFailed'))
      }
    } catch {
      setCreateError(t('deployFailed'))
    } finally {
      setCreating(false)
    }
  }, [form, fetchData, t])

  const toggleCanary = useCallback(async (id: string, enabled: boolean) => {
    await fetch(`/api/canaries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    await fetchData()
  }, [fetchData])

  const loadTriggers = useCallback(async (canaryId: string) => {
    if (triggers[canaryId]) return
    const res = await fetch(`/api/canaries/${canaryId}/triggers`)
    if (res.ok) {
      const data = await res.json()
      setTriggers(prev => ({ ...prev, [canaryId]: data.items || [] }))
    }
  }, [triggers])

  const canaryTypeIcons: Record<string, string> = {
    fake_admin: '👑',
    fake_service: '⚙️',
    fake_gmsa: '🔐',
    fake_vpn: '🌐',
    fake_api_key: '🔑',
  }
  const canaryTypeLabels: Record<string, string> = {
    fake_admin: t('fakeAdmin'),
    fake_service: t('fakeService'),
    fake_gmsa: t('fakeGmsa'),
    fake_vpn: t('fakeVpn'),
    fake_api_key: t('fakeApiKey'),
  }
  const inputClass = 'w-full px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]'

  if (loading && canaries.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" role="status" aria-busy="true" aria-label={tCommon('loading')}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!canManage}
          title={canManage ? undefined : hint('iam_admin')}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-info)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {!canManage && <Lock size={14} aria-hidden="true" />}
          {t('deployNew')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label={t('totalCanaries')} value={stats.total} color="blue" />
        <MetricCard label={t('activeCanaries')} value={stats.active} color="green" />
        <MetricCard label={t('triggeredEver')} value={stats.triggeredEver} color="orange" />
        <MetricCard label={t('triggered24h')} value={stats.triggered24h} color="red" />
      </div>

      {createError && (
        <p className="rounded-md border px-3 py-2 text-sm text-[var(--text-primary)]" style={{ borderColor: 'var(--color-critical)' }} role="alert"><bdi>{createError}</bdi></p>
      )}

      {/* Create dialog */}
      {showCreate && canManage && (
        <form
          className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6"
          style={{ boxShadow: 'var(--shadow-card)' }}
          onSubmit={(e) => { e.preventDefault(); createCanary() }}
          aria-labelledby="deploy-canary-title"
        >
          <h3 id="deploy-canary-title" className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('deployNew')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="canary-type" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('canaryType')}</label>
              <select
                id="canary-type"
                value={form.canaryType}
                onChange={(e) => setForm(f => ({ ...f, canaryType: e.target.value }))}
                className={inputClass}
              >
                {Object.entries(canaryTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="canary-name" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('name')}</label>
              <input
                id="canary-name"
                dir="ltr"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('namePlaceholder')}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="canary-description" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('description')}</label>
              <input
                id="canary-description"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder={t('descriptionPlaceholder')}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="canary-placement" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('placement')}</label>
              <input
                id="canary-placement"
                dir="ltr"
                value={form.placementLocation}
                onChange={(e) => setForm(f => ({ ...f, placementLocation: e.target.value }))}
                placeholder={t('placementPlaceholder')}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="canary-webhook" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('webhookUrl')}</label>
              <input
                id="canary-webhook"
                type="url"
                dir="ltr"
                value={form.alertWebhookUrl}
                onChange={(e) => setForm(f => ({ ...f, alertWebhookUrl: e.target.value }))}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-[var(--border-default)] rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]">
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={creating || !form.name || !form.description || !form.placementLocation}
              className="px-4 py-2 bg-[var(--color-info)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {creating ? tCommon('loading') : t('deploy')}
            </button>
          </div>
        </form>
      )}

      {/* Canary cards */}
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {canaries.map((canary) => {
          const expanded = expandedId === canary.id
          return (
            <li
              key={canary.id}
              className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-5 transition-colors"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl" aria-hidden="true">{canaryTypeIcons[canary.canaryType] || '?'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] break-words"><bdi>{canary.identityName}</bdi></p>
                    <p className="text-xs text-[var(--text-secondary)]">{canaryTypeLabels[canary.canaryType] ?? canary.canaryType}</p>
                  </div>
                </div>
                {canManage ? (
                  <button
                    role="switch"
                    aria-checked={canary.enabled}
                    aria-label={t('toggleCanary', { name: canary.identityName })}
                    onClick={() => toggleCanary(canary.id, !canary.enabled)}
                    className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border text-[var(--text-primary)]"
                    style={{ borderColor: canary.enabled ? 'var(--color-low)' : 'var(--border-hover)' }}
                  >
                    {canary.enabled ? t('enabled') : t('disabled')}
                  </button>
                ) : (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border text-[var(--text-primary)]"
                    style={{ borderColor: canary.enabled ? 'var(--color-low)' : 'var(--border-hover)' }}>
                    {canary.enabled ? t('enabled') : t('disabled')}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3" dir="auto">{canary.description}</p>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{format.number(canary.triggerCount)}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{t('triggerCount', { count: canary.triggerCount })}</p>
                </div>
                {canary.lastTriggeredAt && (
                  <div className="text-end">
                    <p className="text-xs text-[var(--text-primary)] font-semibold">{t('lastTriggered')}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {format.dateTime(new Date(canary.lastTriggeredAt), { dateStyle: 'medium' })}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setExpandedId(expanded ? null : canary.id)
                  loadTriggers(canary.id)
                }}
                aria-expanded={expanded}
                aria-controls={`canary-details-${canary.id}`}
                className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
              >
                <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                {expanded ? t('hideDetails') : t('showDetails')}
              </button>

              {expanded && (
                <div id={`canary-details-${canary.id}`} className="mt-3 pt-3 border-t border-[var(--border-default)]">
                  <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">{t('placement')}: <bdi dir="ltr">{canary.placementLocation}</bdi></p>
                  {(triggers[canary.id] || []).length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-[var(--text-secondary)]">{t('recentTriggers')}</p>
                      {(triggers[canary.id] || []).slice(0, 5).map((trig: any) => (
                        <div key={trig.id} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[var(--bg-secondary)] rounded p-2">
                          <bdi className="text-[var(--text-primary)]">{trig.eventType}</bdi>
                          <span className="text-[var(--text-secondary)]" dir="ltr">{trig.sourceIp}</span>
                          <span className="text-[var(--text-secondary)]">{format.dateTime(new Date(trig.triggeredAt), { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)]">{t('noTriggers')}</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {canaries.length === 0 && !loading && (
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-8 text-center">
          <p className="text-[var(--text-secondary)]">{t('noCanaries')}</p>
        </div>
      )}
    </div>
  )
}

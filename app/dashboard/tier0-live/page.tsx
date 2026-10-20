'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { ArrowRight, Shield, ShieldAlert, Server, Clock, Loader2, Info } from 'lucide-react'
import { StatTile } from '@/components/ui/stat-tile'
import { StatTileSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'

interface Session {
  id: string
  identityId: string
  identityName: string
  identityType: string
  identitySubType: string
  identityRisk: number | null
  hostName: string
  hostType: string
  logonType: string
  privileged: boolean
  sourceHost: string | null
  sourceIp: string | null
  startedAt: string
  lastSeenAt: string
  anomalous: boolean
  anomalyReason: string | null
}
interface Resp {
  sessions: Session[]
  summary: { active: number; anomalous: number; privileged: number; hosts: number; identities: number }
  /**
   * True only when sessions come from real logon telemetry (a session/EDR collector).
   * The API does not set it yet — every session in this release is sample data — so the
   * page shows a neutral "Preview" badge instead of "Live".
   */
  live?: boolean
}

function elapsed(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  const m = Math.floor(s / 60)
  return { s, m, h: Math.floor(m / 60), mm: m % 60 }
}

function initials(name: string) {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

export default function Tier0LivePage() {
  const tNav = useTranslations('nav')
  const t = useTranslations('tier0Live')
  const tId = useTranslations('identity')
  const ago = (iso: string, now: number) => {
    const { s, m, h, mm } = elapsed(iso, now)
    if (s < 60) return t('durationSeconds', { s })
    if (m < 60) return t('durationMinutes', { m })
    return t('durationHours', { h, m: mm })
  }
  const logonLabel = (lt: string) => (t.has(`logon.${lt}`) ? t(`logon.${lt}`) : lt.replace(/_/g, ' '))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery<Resp>({
    queryKey: ['tier0-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/tier0/sessions')
      if (!res.ok) throw new Error('sessions')
      return res.json()
    },
    refetchInterval: 12_000,
  })
  const isLive = data?.live === true

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header with live indicator */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-title text-[var(--text-primary)]">{tNav('tier0Live')}</h2>
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-critical)]/30 bg-[var(--color-critical-bg)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]">
                <span aria-hidden className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-critical)] opacity-70 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-critical)]" />
                </span>
                {t('live')}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-tertiary)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                title={t('previewBadgeHint')}
              >
                <span aria-hidden className="inline-flex h-2 w-2 rounded-full border border-[var(--text-secondary)]" />
                {t('previewBadge')}
              </span>
            )}
          </div>
          <p className="text-caption text-[var(--text-secondary)] mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 text-micro text-[var(--text-secondary)] tabular-nums" aria-live="polite">
          {isFetching ? <Loader2 aria-hidden size={13} className="animate-spin" /> : <Clock aria-hidden size={13} />}
          {dataUpdatedAt ? t('updatedAgo', { time: ago(new Date(dataUpdatedAt).toISOString(), now) }) : t('updating')}
        </div>
      </div>

      {/* Preview / collector notice (hidden once real telemetry feeds the page) */}
      {!isLive && (
        <div role="note" className="flex items-start gap-2 rounded-lg border border-[var(--color-medium)]/40 bg-[var(--color-medium-bg)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <Info aria-hidden className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:color-mix(in_srgb,var(--color-medium)_70%,var(--text-primary))]" />
          <span><span className="font-medium text-[var(--text-primary)]">{t('previewTitle')}</span> {t('previewBody')}</span>
        </div>
      )}

      {/* Summary */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)}</div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label={t('statActive')} value={data.summary.active} severity={data.summary.active > 0 ? 'high' : 'low'} hint={isLive ? t('statActiveHint') : t('statActiveHintSample')} />
          <StatTile label={t('statAnomalous')} value={data.summary.anomalous} severity={data.summary.anomalous > 0 ? 'critical' : 'low'} hint={t('statAnomalousHint')} />
          <StatTile label={t('statPrivileged')} value={data.summary.privileged} severity={data.summary.privileged > 0 ? 'high' : 'low'} hint={t('statPrivilegedHint')} />
          <StatTile label={t('statHosts')} value={data.summary.hosts} severity="neutral" hint={t('statHostsHint')} />
        </div>
      ) : null}

      {/* Session list */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] animate-pulse" />)}</div>
      ) : error ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]"><ErrorState onRetry={() => refetch()} /></div>
      ) : data && data.sessions.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <EmptyState icon="sessions" title={t('emptyTitle')} description={t('emptyDescription')} />
        </div>
      ) : (
        <div className="space-y-2">
          {data?.sessions.map((s) => {
            const isNhi = s.identityType === 'non_human'
            return (
              <div
                key={s.id}
                className="relative flex items-center gap-3 sm:gap-4 overflow-hidden rounded-[var(--radius-card)] border bg-[var(--bg-primary)] p-3.5 ps-4"
                style={{ boxShadow: 'var(--shadow-card)', borderColor: s.anomalous ? 'var(--color-critical)' : 'var(--border-default)' }}
              >
                <span className="absolute inset-y-0 start-0 w-[3px]" style={{ background: s.anomalous ? 'var(--color-critical)' : s.privileged ? 'var(--color-high)' : 'var(--color-tier2)' }} />

                {/* who */}
                <div className="flex min-w-0 items-center gap-3" style={{ flexBasis: '30%' }}>
                  <div aria-hidden className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: isNhi ? 'var(--color-nhi)' : 'var(--color-human)' }}>
                    {initials(s.identityName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]"><bdi>{s.identityName}</bdi></p>
                    <p className="truncate text-[11px] text-[var(--text-secondary)]">
                      {s.identitySubType ? (tId.has(s.identitySubType) ? tId(s.identitySubType) : s.identitySubType.replace(/_/g, ' ')) : ''}
                      {s.identityRisk != null ? ` · ${t('riskValue', { score: s.identityRisk })}` : ''}
                    </p>
                  </div>
                </div>

                {/* → host */}
                <ArrowRight aria-label={t('loggedOnTo')} className="hidden h-4 w-4 flex-shrink-0 text-[var(--text-secondary)] sm:block rtl:rotate-180" />
                <div className="flex min-w-0 items-center gap-2" style={{ flexBasis: '22%' }}>
                  <Server aria-hidden className="h-4 w-4 flex-shrink-0 text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]"><bdi>{s.hostName}</bdi></p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]">{t('tier0')}</p>
                  </div>
                </div>

                {/* how */}
                <div className="hidden items-center gap-2 md:flex" style={{ flexBasis: '20%' }}>
                  <span className="rounded border border-[var(--border-default)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">{logonLabel(s.logonType)}</span>
                  {s.privileged && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:color-mix(in_srgb,var(--color-high)_60%,var(--text-primary))]" title={t('adminHint')}><Shield aria-hidden className="h-3 w-3" /> {t('admin')}</span>
                  )}
                </div>

                {/* from + when */}
                <div className="ms-auto flex flex-col items-end gap-0.5 text-end min-w-0">
                  <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums text-[var(--text-primary)]" title={t('sessionDuration')}><Clock aria-hidden className="h-3 w-3 text-[var(--text-secondary)]" />{ago(s.startedAt, now)}</span>
                  {s.sourceHost && <span className="text-[11px] tabular-nums text-[var(--text-secondary)] truncate max-w-full">{t('fromSource')} <bdi>{s.sourceHost}{s.sourceIp ? ` · ${s.sourceIp}` : ''}</bdi></span>}
                </div>

                {s.anomalous && s.anomalyReason && (
                  <div className="absolute bottom-1.5 start-4 hidden items-center gap-1 text-[11px] font-medium text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))] lg:flex">
                    <ShieldAlert aria-hidden className="h-3 w-3" /> <bdi>{s.anomalyReason}</bdi>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

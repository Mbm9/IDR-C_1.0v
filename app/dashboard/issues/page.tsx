'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import {
  ListChecks, X, Clipboard, Check, Clock, AlertTriangle,
  RotateCcw, CheckCircle2, TrendingUp, Circle,
} from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils/formatters'
import { useAppRole } from '@/lib/hooks/use-app-role'
import { useEnumLabel, humanizeEnum } from '@/components/ui/enum-label'
import { TONE_TEXT, toneBadge, severityTone, type Tone } from '@/components/ui/tone'

type Status = 'no_action' | 'in_progress' | 'done' | 'accepted_risk'
type Severity = 'critical' | 'high' | 'medium' | 'low'

interface Issue {
  fsid: string; type: string; name: string; category: string; severity: Severity; impact: string
  mitre: string[]; certainty: string; privilege: string; ease: string
  affectedCount: number; exposurePoints: number; status: Status
  firstDetectedAt: string | null; lastSeenAt: string | null
}
interface IssueDetail {
  def: { fsid: string; name: string; category: string; severity: Severity; description: string
    mitre: string[]; certainty: string; privilege: string; ease: string
    mitigation: { summary: string; steps: string[]; script?: { lang: string; code: string } } }
  affectedCount: number; exposurePoints: number; status: Status; notes: string | null
  firstDetectedAt: string | null; lastSeenAt: string | null
  affected: { name: string; ref?: string }[]
  events: { type: string; affectedCount: number; detail: string | null; at: string }[]
}

const severityStyle = (severity: string) => toneBadge(severityTone(severity))
const STATUS_TONES: Record<Status, Tone> = {
  no_action: 'neutral',
  in_progress: 'medium',
  done: 'low',
  accepted_risk: 'nhi',
}
const statusStyle = (status: Status) => toneBadge(STATUS_TONES[status] ?? 'neutral')
const EVENT_META: Record<string, { icon: typeof Clock; color: string }> = {
  first_detected: { icon: Circle, color: 'var(--color-high-text)' },
  risk_increased: { icon: TrendingUp, color: 'var(--color-critical-text)' },
  reappeared: { icon: RotateCcw, color: 'var(--color-high-text)' },
  partially_remediated: { icon: AlertTriangle, color: 'var(--color-medium-text)' },
  fully_remediated: { icon: CheckCircle2, color: 'var(--color-low-text)' },
  status_changed: { icon: Clock, color: 'var(--text-secondary)' },
}
const filterBtn = (active: boolean) =>
  `text-xs px-2.5 py-1 rounded-md border ${active ? `border-[var(--color-high)] bg-[var(--color-high-bg)] ${TONE_TEXT.high}` : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`

async function getJSON<T>(u: string): Promise<T> { const r = await fetch(u); if (!r.ok) throw new Error('failed'); return r.json() }

function CopyButton({ text }: { text: string }) {
  const t = useTranslations('issues')
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-xs flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" aria-live="polite">
      {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Clipboard className="w-3.5 h-3.5" aria-hidden="true" />}{copied ? t('copied') : t('copy')}
    </button>
  )
}

function DetailPanel({ fsid, onClose }: { fsid: string; onClose: () => void }) {
  const qc = useQueryClient()
  const t = useTranslations('issues')
  const tSeverity = useTranslations('severity')
  const locale = useLocale()
  const label = useEnumLabel()
  const { can } = useAppRole()
  // PATCH /api/issues/[fsid] requires the analyst role.
  const canEdit = can('analyst')
  const { data, isLoading } = useQuery({ queryKey: ['issue', fsid], queryFn: () => getJSON<IssueDetail>(`/api/issues/${fsid}`) })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function setStatus(status: Status) {
    await fetch(`/api/issues/${fsid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    qc.invalidateQueries({ queryKey: ['issue', fsid] })
    qc.invalidateQueries({ queryKey: ['issues'] })
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        className="relative w-full max-w-xl h-full overflow-y-auto bg-[var(--bg-primary)] border-s border-[var(--border-default)] shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-detail-title"
      >
        {isLoading || !data ? (
          <div className="h-40 animate-pulse" role="status"><span className="sr-only">{t('loading')}</span></div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-[var(--text-secondary)] font-mono"><bdi>{data.def.fsid}</bdi></p>
                <h3 id="issue-detail-title" className="text-lg font-bold text-[var(--text-primary)]">{data.def.name}</h3>
              </div>
              <button type="button" onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" aria-label={t('close')} autoFocus>
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full font-medium ${severityStyle(data.def.severity)}`}>{tSeverity(data.def.severity)}</span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{label('issueCategory', data.def.category)}</span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{t('affectedCount', { count: data.affectedCount })}</span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{t('exposurePointsCount', { count: data.exposurePoints })}</span>
            </div>

            {/* status control */}
            <div>
              <p id="issue-status-label" className="text-xs uppercase tracking-wide text-[var(--text-secondary)] mb-1">{t('status')}</p>
              {canEdit ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="issue-status-label">
                  {(['no_action', 'in_progress', 'done', 'accepted_risk'] as Status[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      aria-pressed={data.status === s}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${data.status === s ? `${statusStyle(s)} border-current` : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
                    >
                      {t(`status_${s}`)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className={`inline-block text-xs px-2.5 py-1 rounded-md ${statusStyle(data.status)}`}>{t(`status_${data.status}`)}</span>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-[var(--border-default)] p-2">
                <dt className="text-[var(--text-secondary)]">{t('certainty')}</dt>
                <dd className="text-[var(--text-primary)]">{label('certainty', data.def.certainty)}</dd>
              </div>
              <div className="rounded-lg border border-[var(--border-default)] p-2">
                <dt className="text-[var(--text-secondary)]">{t('privilege')}</dt>
                <dd className="text-[var(--text-primary)]">{label('privilege', data.def.privilege)}</dd>
              </div>
              <div className="rounded-lg border border-[var(--border-default)] p-2">
                <dt className="text-[var(--text-secondary)]">{t('ease')}</dt>
                <dd className="text-[var(--text-primary)]">{label('ease', data.def.ease)}</dd>
              </div>
            </dl>

            <p className="text-sm text-[var(--text-secondary)]">{data.def.description}</p>
            {data.def.mitre.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.def.mitre.map((m) => (
                  <span key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"><bdi>{m}</bdi></span>
                ))}
              </div>
            )}

            {/* mitigation */}
            <div className="rounded-xl border border-[var(--border-default)] p-3 space-y-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{t('mitigation')}</p>
              <p className="text-sm text-[var(--text-secondary)]">{data.def.mitigation.summary}</p>
              {data.def.mitigation.steps.length > 0 && (
                <ol className="list-decimal ms-4 space-y-1 text-sm text-[var(--text-secondary)]">
                  {data.def.mitigation.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
              {data.def.mitigation.script && (
                <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-default)] overflow-hidden" dir="ltr">
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border-default)]">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">{data.def.mitigation.script.lang}</span>
                    <CopyButton text={data.def.mitigation.script.code} />
                  </div>
                  <pre className="p-2.5 text-xs overflow-x-auto text-[var(--text-secondary)] whitespace-pre-wrap" tabIndex={0}>{data.def.mitigation.script.code}</pre>
                </div>
              )}
            </div>

            {/* timeline */}
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('timeline')}</p>
              {data.events.length === 0 ? <p className="text-xs text-[var(--text-secondary)]">{t('noEvents')}</p> : (
                <ul className="space-y-2">
                  {data.events.map((e, i) => {
                    const m = EVENT_META[e.type] ?? EVENT_META.status_changed
                    const Icon = m.icon
                    const detail = e.detail ? (t.has(`status_${e.detail}`) ? t(`status_${e.detail}`) : humanizeEnum(e.detail)) : null
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: m.color }} aria-hidden="true" />
                        <div>
                          <span className="text-[var(--text-primary)]">{label('issueEvent', e.type)}</span>
                          {e.type !== 'fully_remediated' && <span className="text-[var(--text-secondary)]"> · {t('affectedCount', { count: e.affectedCount })}</span>}
                          {detail && <span className="text-[var(--text-secondary)]"> · {detail}</span>}
                          <span className="block text-xs text-[var(--text-secondary)]">{formatRelativeTime(new Date(e.at), locale)}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* affected objects */}
            {data.affected.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('affectedObjects')} ({data.affectedCount})</p>
                <ul
                  className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-default)] divide-y divide-[var(--border-default)]"
                  tabIndex={0}
                  aria-label={t('affectedObjects')}
                >
                  {data.affected.map((a, i) => (
                    <li key={i} className="px-2.5 py-1.5 text-sm text-[var(--text-secondary)]">
                      {a.ref ? <a href={`/dashboard/identities/${a.ref}`} className="hover:underline"><bdi>{a.name}</bdi></a> : <bdi>{a.name}</bdi>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function IssuesPage() {
  const t = useTranslations('issues')
  const tSeverity = useTranslations('severity')
  const locale = useLocale()
  const label = useEnumLabel()
  const { data, isLoading, error } = useQuery({ queryKey: ['issues'], queryFn: () => getJSON<{ issues: Issue[] }>('/api/issues') })
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [sevFilter, setSevFilter] = useState<'all' | Severity>('all')
  const [open, setOpen] = useState<string | null>(null)

  const issues = (data?.issues ?? []).filter((i) =>
    (statusFilter === 'all' || i.status === statusFilter) && (sevFilter === 'all' || i.severity === sevFilter))

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <ListChecks className="w-6 h-6 text-[var(--color-high-text)]" aria-hidden="true" />{t('title')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">{t('subtitle')}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('filterStatus')}>
          {(['all', 'no_action', 'in_progress', 'done', 'accepted_risk'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s} className={filterBtn(statusFilter === s)}>
              {s === 'all' ? t('all') : t(`status_${s}`)}
            </button>
          ))}
        </div>
        <span className="w-px bg-[var(--border-default)] mx-1" aria-hidden="true" />
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('filterSeverity')}>
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSevFilter(s)} aria-pressed={sevFilter === s} className={filterBtn(sevFilter === s)}>
              {s === 'all' ? t('all') : tSeverity(s)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="h-64 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] animate-pulse" />}
      {error && (
        <div className="rounded-xl border border-[var(--color-critical)] bg-[var(--color-critical-bg)] p-6" role="alert">
          <p className={`font-medium ${TONE_TEXT.critical}`}>{t('failedToLoad')}</p>
        </div>
      )}

      {data && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border-default)]">
                <th scope="col" className="px-4 py-2 font-medium text-start whitespace-nowrap">{t('colStatus')}</th>
                <th scope="col" className="px-4 py-2 font-medium text-start whitespace-nowrap">{t('colIssue')}</th>
                <th scope="col" className="px-4 py-2 font-medium text-start whitespace-nowrap">{t('colSeverity')}</th>
                <th scope="col" className="px-4 py-2 font-medium text-start whitespace-nowrap">{t('colExposure')}</th>
                <th scope="col" className="px-4 py-2 font-medium text-start whitespace-nowrap">{t('colCertainty')}</th>
                <th scope="col" className="px-4 py-2 font-medium text-start whitespace-nowrap">{t('colEase')}</th>
                <th scope="col" className="px-4 py-2 font-medium text-start whitespace-nowrap">{t('colAffected')}</th>
                <th scope="col" className="px-4 py-2 font-medium text-start whitespace-nowrap">{t('colFirstSeen')}</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr
                  key={i.fsid}
                  onClick={() => setOpen(i.fsid)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(i.fsid) } }}
                  tabIndex={0}
                  aria-haspopup="dialog"
                  className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-info)] cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusStyle(i.status)}`}>{t(`status_${i.status}`)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {/* Rows are focusable and open the detail panel with Enter or Space. */}
                    <div className="text-[var(--text-primary)]">{i.name}</div>
                    <div className="text-[10px] font-mono text-[var(--text-secondary)]"><bdi>{i.fsid}</bdi></div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${severityStyle(i.severity)}`}>{tSeverity(i.severity)}</span>
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)]">{i.exposurePoints}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{label('certainty', i.certainty)}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{label('ease', i.ease)}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{i.affectedCount}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">
                    {i.firstDetectedAt ? formatRelativeTime(new Date(i.firstDetectedAt), locale) : '—'}
                  </td>
                </tr>
              ))}
              {issues.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-secondary)]">{t('noIssues')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && <DetailPanel fsid={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { hasRole } from '@/lib/utils/rbac'
import { setLocale } from '@/lib/locale'
import { useRoleHint } from '@/lib/hooks/use-role-hint'
import {
  Building2, Users, Plug, FileText, Bell, Key, Shield, Palette, Plus, Copy, Trash2, Webhook, Loader2, TestTube2,
  Zap, ToggleLeft, ToggleRight, MonitorSmartphone, LogOut, Lock,
} from 'lucide-react'
import type { AppRole } from '@/lib/utils/rbac'
import type { Locale } from '@/lib/locale'

const ROLES: AppRole[] = ['viewer', 'analyst', 'iam_admin', 'ciso', 'admin']

type TabKey = 'org' | 'team' | 'sessions' | 'integrations' | 'policies' | 'notifications' | 'apikeys' | 'audit' | 'webhooks' | 'automation' | 'appearance'

const inputClass = 'px-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]'

export default function SettingsPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<TabKey>('org')
  const userRole = (session?.user as any)?.appRole as AppRole | undefined
  const t = useTranslations('settings')

  const TABS: { key: TabKey; label: string; icon: typeof Building2 }[] = [
    { key: 'org', label: t('organization'), icon: Building2 },
    { key: 'team', label: t('team'), icon: Users },
    { key: 'sessions', label: t('sessions.tab'), icon: MonitorSmartphone },
    { key: 'integrations', label: t('integrations'), icon: Plug },
    { key: 'policies', label: t('policies'), icon: FileText },
    { key: 'notifications', label: t('notifications'), icon: Bell },
    { key: 'apikeys', label: t('apiKeys'), icon: Key },
    { key: 'audit', label: t('auditCompliance'), icon: Shield },
    { key: 'webhooks', label: t('webhooks'), icon: Webhook },
    { key: 'automation', label: t('automation'), icon: Zap },
    { key: 'appearance', label: t('appearance'), icon: Palette },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-52 flex-shrink-0 min-w-0">
          <SettingsTabBar tabs={TABS} active={activeTab} onChange={setActiveTab} label={t('tabsLabel')} />
        </div>

        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          className="flex-1 min-w-0 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 sm:p-6"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          {activeTab === 'org' && <OrgTab />}
          {activeTab === 'team' && <TeamTab userRole={userRole} />}
          {activeTab === 'sessions' && <SessionsTab />}
          {activeTab === 'policies' && <PoliciesTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'apikeys' && <ApiKeysTab userRole={userRole} />}
          {activeTab === 'webhooks' && <WebhooksTab />}
          {activeTab === 'automation' && <AutomationTab />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'integrations' && <p className="text-caption text-[var(--text-secondary)]">{t('integrationsNote')}</p>}
          {activeTab === 'audit' && <AuditComplianceTab />}
        </div>
      </div>
    </div>
  )
}

/**
 * Tab list: vertical on desktop, a horizontally scrolling strip on smaller
 * screens with fade edges showing that more tabs are off-screen. Arrow keys,
 * Home and End move between tabs (WAI-ARIA tabs pattern); the selected tab is
 * scrolled into view.
 */
function SettingsTabBar({ tabs, active, onChange, label }: {
  tabs: { key: TabKey; label: string; icon: typeof Building2 }[]
  active: TabKey
  onChange: (key: TabKey) => void
  label: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [edges, setEdges] = useState({ start: false, end: false })

  const updateEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    if (max <= 1) { setEdges({ start: false, end: false }); return }
    // scrollLeft is 0..max in LTR and 0..-max in RTL (Chromium/Firefox/Safari)
    const offset = Math.abs(el.scrollLeft)
    setEdges({ start: offset > 1, end: offset < max - 1 })
  }, [])

  useEffect(() => {
    updateEdges()
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(updateEdges)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateEdges])

  useEffect(() => {
    tabRefs.current[active]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex(tab => tab.key === active)
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    let next = -1
    if (e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (idx + 1) % tabs.length
    else if (e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next].key)
    tabRefs.current[tabs[next].key]?.focus()
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={updateEdges}
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 scroll-smooth [scrollbar-width:thin]"
      >
        {tabs.map(tab => {
          const Icon = tab.icon
          const selected = active === tab.key
          return (
            <button
              key={tab.key}
              ref={el => { tabRefs.current[tab.key] = el }}
              id={`settings-tab-${tab.key}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`settings-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.key)}
              className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-md text-caption font-medium whitespace-nowrap transition-colors border-b-2 lg:border-b-0 lg:border-s-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-info)] ${
                selected
                  ? 'bg-[var(--color-info-bg)] text-[var(--text-primary)] border-[var(--color-info)]'
                  : 'text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {tab.label}
            </button>
          )
        })}
      </div>
      {/* Fade edges: only on the scrolling (mobile/tablet) layout, only when more tabs are hidden that way */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 start-0 w-8 lg:hidden transition-opacity bg-gradient-to-r rtl:bg-gradient-to-l from-[var(--bg-primary)] to-transparent ${edges.start ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 end-0 w-10 lg:hidden transition-opacity bg-gradient-to-l rtl:bg-gradient-to-r from-[var(--bg-primary)] to-transparent ${edges.end ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

function ReadOnlyNote({ role }: { role: AppRole }) {
  const tAccess = useTranslations('access')
  return (
    <p className="mb-4 flex items-start gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-caption text-[var(--text-primary)]" role="note">
      <Lock size={14} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
      {tAccess('readOnlyNotice', { role: tAccess(`roles.${role}`) })}
    </p>
  )
}

function OrgTab() {
  const { data: session } = useSession()
  const t = useTranslations('settings')
  const tAccess = useTranslations('access')
  const role = ((session?.user as any)?.appRole || 'viewer') as AppRole
  return (
    <div>
      <h3 className="text-heading text-[var(--text-primary)] mb-4">{t('organization')}</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { key: 'name', label: t('orgName'), value: 'Acme Financial Services' },
          { key: 'domain', label: t('orgDomain'), value: 'acmefs.sa' },
          { key: 'frameworks', label: t('orgFrameworks'), value: 'NCA ECC, SAMA CSF, PDPL' },
          { key: 'forest', label: t('orgAdForest'), value: 'acmefs.local' },
          { key: 'role', label: t('orgYourRole'), value: tAccess(`roles.${role}`) },
          { key: 'email', label: t('orgEmail'), value: session?.user?.email || '' },
        ].map(f => (
          <div key={f.key} className="p-3 rounded-md bg-[var(--bg-secondary)]">
            <dt className="text-micro text-[var(--text-secondary)] uppercase tracking-wider">{f.label}</dt>
            <dd className="text-body text-[var(--text-primary)] mt-0.5 break-words"><bdi>{f.value}</bdi></dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function TeamTab({ userRole }: { userRole?: AppRole }) {
  const queryClient = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<AppRole>('viewer')
  const [inviteError, setInviteError] = useState<string | null>(null)
  /** Single-use invite link — returned once by POST /api/settings/team (only a hash is stored). */
  const [inviteResult, setInviteResult] = useState<{ email: string; url: string | null; emailed: boolean } | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [pendingInviteRevoke, setPendingInviteRevoke] = useState<string | null>(null)
  const [revokeInviteError, setRevokeInviteError] = useState<string | null>(null)
  const t = useTranslations('settings')
  const tAccess = useTranslations('access')

  const { data } = useQuery({
    queryKey: ['settings', 'team'],
    queryFn: async () => { const r = await fetch('/api/settings/team'); return r.json() },
  })

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/settings/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const body = await r.json().catch(() => ({}))
      // 409: duplicate pending invite / existing account; 403: seat limit or role above yours
      if (!r.ok) throw new Error(body.error || t('inviteFailed'))
      return body
    },
    onMutate: () => { setInviteError(null); setInviteResult(null); setLinkCopied(false) },
    onSuccess: (body: { invitation?: { email?: string }; inviteUrl?: string; emailed?: boolean }) => {
      setInviteResult({ email: body.invitation?.email || inviteEmail, url: body.inviteUrl ?? null, emailed: !!body.emailed })
      queryClient.invalidateQueries({ queryKey: ['settings', 'team'] })
      setInviteEmail('')
    },
    onError: (err: Error) => setInviteError(err.message || t('inviteFailed')),
  })

  const revokeInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const r = await fetch('/api/settings/team', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || t('revokeInvitationFailed'))
      return body
    },
    onMutate: () => setRevokeInviteError(null),
    onSuccess: () => { setPendingInviteRevoke(null); queryClient.invalidateQueries({ queryKey: ['settings', 'team'] }) },
    onError: (err: Error) => setRevokeInviteError(err.message || t('revokeInvitationFailed')),
  })

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const r = await fetch('/api/settings/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      return r.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'team'] }),
  })

  const isAdmin = !!userRole && hasRole(userRole, 'admin')
  const roleLabel = (r: string) => (ROLES as string[]).includes(r) ? tAccess(`roles.${r as AppRole}`) : r

  return (
    <div>
      <h3 className="text-heading text-[var(--text-primary)] mb-4">{t('teamMembers')}</h3>
      {!isAdmin && userRole && <ReadOnlyNote role="admin" />}
      {isAdmin && (
        <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate() }}>
          <label htmlFor="invite-email" className="sr-only">{t('inviteEmailLabel')}</label>
          <input id="invite-email" type="email" dir="ltr" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@example.com"
            className={`flex-1 min-w-0 ${inputClass}`} />
          <label htmlFor="invite-role" className="sr-only">{t('inviteRoleLabel')}</label>
          <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as AppRole)} className={inputClass}>
            {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <button type="submit" disabled={!inviteEmail || inviteMutation.isPending}
            className="px-4 py-2 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">
            <Plus size={14} aria-hidden="true" /> {t('invite')}
          </button>
        </form>
      )}
      {inviteError && (
        <p className="-mt-2 mb-4 text-caption text-[var(--text-primary)] rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-critical)' }} role="alert"><bdi>{inviteError}</bdi></p>
      )}
      {inviteResult && (
        <div className="-mt-2 mb-4 rounded-md border p-3 bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--color-low)' }} role="status">
          <p className="text-caption font-medium text-[var(--text-primary)]">
            {inviteResult.emailed ? t('inviteEmailed', { email: inviteResult.email }) : t('inviteCreated', { email: inviteResult.email })}
          </p>
          {!inviteResult.emailed && (
            <p className="mt-1 text-caption text-[var(--text-secondary)]">{t('inviteShareLink')}</p>
          )}
          {inviteResult.url && (
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="invite-link" className="sr-only">{t('inviteLinkLabel')}</label>
              <input id="invite-link" readOnly dir="ltr" value={inviteResult.url} onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 px-2 py-1.5 text-micro font-mono rounded border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)]" />
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(inviteResult.url!).then(() => setLinkCopied(true)).catch(() => {}) }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-caption rounded border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              >
                <Copy size={14} aria-hidden="true" /> <span aria-live="polite">{linkCopied ? t('linkCopied') : t('copyLink')}</span>
              </button>
            </div>
          )}
          {inviteResult.url && <p className="mt-1 text-micro text-[var(--text-secondary)]">{t('inviteLinkOnce')}</p>}
          <button type="button" onClick={() => setInviteResult(null)} className="mt-2 text-caption underline text-[var(--text-primary)]">{t('dismiss')}</button>
        </div>
      )}
      <ul className="space-y-2">
        {data?.members?.map((m: any) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-[var(--bg-secondary)]">
            <div className="min-w-0">
              <p className="text-body font-medium text-[var(--text-primary)] break-words"><bdi>{m.name || m.email}</bdi></p>
              <p className="text-caption text-[var(--text-secondary)] break-all"><bdi>{m.email}</bdi></p>
            </div>
            {isAdmin ? (
              <select value={m.appRole} onChange={(e) => roleMutation.mutate({ userId: m.id, role: e.target.value })}
                aria-label={t('memberRoleLabel', { name: m.name || m.email })}
                className="px-2 py-1 border border-[var(--border-default)] rounded-[var(--radius-input)] text-caption bg-[var(--bg-primary)] text-[var(--text-primary)]">
                {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            ) : (
              <span className="text-caption text-[var(--text-secondary)]">{roleLabel(m.appRole)}</span>
            )}
          </li>
        ))}
      </ul>
      {data?.invitations?.length > 0 && (
        <div className="mt-6">
          <h4 className="text-caption font-semibold text-[var(--text-secondary)] mb-2">{t('pendingInvitations')}</h4>
          {revokeInviteError && (
            <p className="mb-2 text-caption text-[var(--text-primary)] rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-critical)' }} role="alert"><bdi>{revokeInviteError}</bdi></p>
          )}
          <ul>
            {data.invitations.map((inv: any) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-caption">
                <span className="text-[var(--text-primary)] break-all"><bdi>{inv.email}</bdi></span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--text-secondary)]">{roleLabel(inv.role)}</span>
                  {isAdmin && (pendingInviteRevoke === inv.id ? (
                    <>
                      <span className="text-[var(--text-primary)]">{t('revokeInvitationConfirm', { email: inv.email })}</span>
                      <button onClick={() => revokeInviteMutation.mutate(inv.id)} disabled={revokeInviteMutation.isPending}
                        className="px-2 py-1 rounded bg-[var(--color-critical)] text-white disabled:opacity-50">
                        {revokeInviteMutation.isPending ? t('revokingInvitation') : t('revokeInvitation')}
                      </button>
                      <button onClick={() => setPendingInviteRevoke(null)} className="px-2 py-1 rounded border border-[var(--border-default)] text-[var(--text-primary)]">
                        {t('cancelWebhook')}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setPendingInviteRevoke(inv.id); setRevokeInviteError(null) }}
                      aria-label={t('revokeInvitationLabel', { email: inv.email })}
                      className="px-2 py-1 rounded border text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--color-critical)' }}>
                      {t('revokeInvitation')}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface ActiveSessionRow {
  id: string
  ipAddress: string | null
  userAgent: string | null
  lastActiveAt: string
  createdAt: string
}

/** Rough "Browser on OS" description from a user-agent string. */
function describeUserAgent(ua: string | null): { browser: string | null; os: string | null } {
  if (!ua) return { browser: null, os: null }
  const browser =
    /Edg\//.test(ua) ? 'Edge'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /Firefox\//.test(ua) ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
              : /^curl\//.test(ua) ? 'curl'
                : /HeadlessChrome/.test(ua) ? 'Chrome' : null
  const os =
    /Windows NT/.test(ua) ? 'Windows'
      : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
          : /Android/.test(ua) ? 'Android'
            : /CrOS/.test(ua) ? 'ChromeOS'
              : /Linux/.test(ua) ? 'Linux' : null
  return { browser, os }
}

function SessionsTab() {
  const t = useTranslations('settings.sessions')
  const format = useFormatter()
  const queryClient = useQueryClient()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [browserUa, setBrowserUa] = useState<string | null>(null)
  useEffect(() => { setBrowserUa(navigator.userAgent) }, [])

  const { data, isLoading, isError, refetch } = useQuery<{ sessions: ActiveSessionRow[] }>({
    queryKey: ['settings', 'sessions'],
    queryFn: async () => {
      const r = await fetch('/api/settings/sessions')
      if (!r.ok) throw new Error('Failed')
      return r.json()
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/settings/sessions/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.error || t('revokeFailed'))
      }
      return r.json()
    },
    onSuccess: () => {
      setConfirmId(null)
      setRevokeError(null)
      queryClient.invalidateQueries({ queryKey: ['settings', 'sessions'] })
    },
    onError: (err: Error) => setRevokeError(err.message || t('revokeFailed')),
  })

  const sessions = [...(data?.sessions ?? [])].sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  )
  const now = Date.now()
  const fmtDate = (d: string) => format.dateTime(new Date(d), { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div>
      <h3 className="text-heading text-[var(--text-primary)]">{t('title')}</h3>
      <p className="text-caption text-[var(--text-secondary)] mt-1 mb-4">{t('description')}</p>

      {isLoading && <p className="text-caption text-[var(--text-secondary)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" aria-hidden="true" />{t('loading')}</p>}
      {isError && (
        <p className="text-caption text-[var(--text-primary)]" role="alert">
          {t('loadFailed')} <button onClick={() => refetch()} className="underline text-[var(--text-primary)]">{t('retry')}</button>
        </p>
      )}
      {revokeError && <p className="mb-3 text-caption text-[var(--text-primary)] rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-critical)' }} role="alert"><bdi>{revokeError}</bdi></p>}

      {!isLoading && !isError && (
        <>
          <p className="text-caption text-[var(--text-secondary)] mb-3">{t('count', { count: sessions.length })}</p>
          <ul className="space-y-2">
            {sessions.map(s => {
              const { browser, os } = describeUserAgent(s.userAgent)
              const device = browser && os ? t('browserOnOs', { browser, os }) : browser || os || t('unknownDevice')
              const isThisBrowser = !!browserUa && s.userAgent === browserUa
              const confirming = confirmId === s.id
              return (
                <li key={s.id} className="p-3 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <MonitorSmartphone size={18} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-body font-medium text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                          <bdi title={s.userAgent ?? undefined}>{device}</bdi>
                          {isThisBrowser && (
                            <span className="text-micro px-1.5 py-0.5 rounded border border-[var(--color-info)] text-[var(--text-primary)]">{t('thisBrowser')}</span>
                          )}
                        </p>
                        <dl className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-caption">
                          <div className="flex gap-1">
                            <dt className="text-[var(--text-secondary)]">{t('ip')}</dt>
                            <dd className="text-[var(--text-primary)]" dir="ltr">{s.ipAddress || t('unknown')}</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt className="text-[var(--text-secondary)]">{t('lastActive')}</dt>
                            <dd className="text-[var(--text-primary)]"><time dateTime={s.lastActiveAt} title={fmtDate(s.lastActiveAt)}>{format.relativeTime(new Date(s.lastActiveAt), now)}</time></dd>
                          </div>
                          <div className="flex gap-1">
                            <dt className="text-[var(--text-secondary)]">{t('created')}</dt>
                            <dd className="text-[var(--text-primary)]"><time dateTime={s.createdAt}>{fmtDate(s.createdAt)}</time></dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                    {!confirming && (
                      <button
                        onClick={() => { setConfirmId(s.id); setRevokeError(null) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium rounded-[var(--radius-button)] border text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                        style={{ borderColor: 'var(--color-critical)' }}
                        aria-label={t('revokeLabel', { device })}
                      >
                        <LogOut size={14} aria-hidden="true" /> {t('revoke')}
                      </button>
                    )}
                  </div>
                  {confirming && (
                    <div className="mt-3 rounded-md border p-3 bg-[var(--bg-primary)]" style={{ borderColor: 'var(--color-critical)' }} role="alertdialog" aria-labelledby={`revoke-q-${s.id}`}>
                      <p id={`revoke-q-${s.id}`} className="text-caption text-[var(--text-primary)]">
                        {isThisBrowser ? t('confirmCurrent') : t('confirm')}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => revokeMutation.mutate(s.id)}
                          disabled={revokeMutation.isPending}
                          className="px-3 py-1.5 text-caption font-medium rounded-[var(--radius-button)] bg-[var(--color-critical)] text-white disabled:opacity-50"
                        >
                          {revokeMutation.isPending ? t('revoking') : t('confirmRevoke')}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-3 py-1.5 text-caption font-medium rounded-[var(--radius-button)] border border-[var(--border-default)] text-[var(--text-primary)]"
                        >
                          {t('keep')}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {sessions.length === 0 && <p className="text-caption text-[var(--text-secondary)] py-4 text-center">{t('empty')}</p>}
        </>
      )}
    </div>
  )
}

function PoliciesTab() {
  const t = useTranslations('settings')
  return (
    <div>
      <h3 className="text-heading text-[var(--text-primary)] mb-4">{t('policyThresholds')}</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: t('dormancyThreshold'), value: t('days90') },
          { label: t('certificationPeriod'), value: t('days90') },
          { label: t('passwordMaxAge'), value: t('days90') },
          { label: t('mfaRequired'), value: t('allUsers') },
          { label: t('overPrivilegeMultiplier'), value: t('orgMedian2x') },
          { label: t('nhiOwnership'), value: t('required') },
        ].map(p => (
          <div key={p.label} className="flex items-center justify-between gap-3 p-3 rounded-md bg-[var(--bg-secondary)]">
            <dt className="text-body text-[var(--text-secondary)]">{p.label}</dt>
            <dd className="text-body font-medium text-[var(--text-primary)]">{p.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function NotificationsTab() {
  const t = useTranslations('settings')
  return (
    <div>
      <h3 className="text-heading text-[var(--text-primary)] mb-4">{t('notificationPreferences')}</h3>
      <ul className="space-y-3">
        {[
          { label: t('criticalViolations'), enabled: true },
          { label: t('certificationsDue'), enabled: true },
          { label: t('aiAnalysisCompleted'), enabled: false },
          { label: t('integrationSyncFailed'), enabled: true },
          { label: t('exceptionsExpiring'), enabled: true },
        ].map(n => (
          <li key={n.label} className="flex items-center justify-between gap-3 p-3 rounded-md bg-[var(--bg-secondary)]">
            <span className="text-body text-[var(--text-primary)]">{n.label}</span>
            <span className="flex items-center gap-2">
              <span className="text-caption text-[var(--text-secondary)]">{n.enabled ? t('on') : t('off')}</span>
              <span aria-hidden="true" className={`w-10 h-6 rounded-full p-0.5 transition-colors ${n.enabled ? 'bg-[var(--color-info)]' : 'bg-[var(--border-hover)]'}`}>
                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${n.enabled ? 'ltr:translate-x-4 rtl:-translate-x-4' : ''}`} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ApiKeysTab({ userRole }: { userRole?: AppRole }) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null)
  const t = useTranslations('settings')
  const isAdmin = !!userRole && hasRole(userRole, 'admin')

  const { data } = useQuery({
    queryKey: ['settings', 'api-keys'],
    queryFn: async () => { const r = await fetch('/api/settings/api-keys'); return r.json() },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/settings/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) })
      return r.json()
    },
    onSuccess: (data) => { if (data.key) setNewKey(data.key); setLabel(''); queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] }) },
  })

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const r = await fetch('/api/settings/api-keys', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyId }) })
      return r.json()
    },
    onSuccess: () => { setPendingRevoke(null); queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] }) },
  })

  return (
    <div>
      <h3 className="text-heading text-[var(--text-primary)] mb-4">{t('apiKeysTitle')}</h3>
      {!isAdmin && userRole && <ReadOnlyNote role="admin" />}
      {newKey && (
        <div className="mb-4 p-3 rounded-md bg-[var(--color-low-bg)] border" style={{ borderColor: 'var(--color-low)' }} role="status">
          <p className="text-caption font-medium text-[var(--text-primary)]">{t('keyCreated')}</p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 min-w-0 break-all text-micro font-mono bg-[var(--bg-primary)] text-[var(--text-primary)] p-2 rounded" dir="ltr">{newKey}</code>
            <button
              onClick={() => { navigator.clipboard?.writeText(newKey).catch(() => {}); setNewKey('') }}
              className="p-2 hover:bg-[var(--bg-secondary)] rounded text-[var(--text-primary)]"
              aria-label={t('copyKey')}
              title={t('copyKey')}
            >
              <Copy size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {isAdmin && (
        <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}>
          <label htmlFor="api-key-label" className="sr-only">{t('keyLabelPlaceholder')}</label>
          <input id="api-key-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('keyLabelPlaceholder')}
            className={`flex-1 min-w-0 ${inputClass}`} />
          <button type="submit" disabled={!label || createMutation.isPending}
            className="px-4 py-2 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50">
            {t('generateKey')}
          </button>
        </form>
      )}
      <ul className="space-y-2">
        {data?.keys?.map((k: any) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-[var(--bg-secondary)]">
            <div className="min-w-0">
              <p className="text-body font-medium text-[var(--text-primary)]"><bdi>{k.label}</bdi></p>
              <p className="text-micro font-mono text-[var(--text-secondary)]" dir="ltr">{k.keyPrefix}...</p>
            </div>
            {isAdmin && (pendingRevoke === k.id ? (
              <span className="flex items-center gap-2">
                <span className="text-caption text-[var(--text-primary)]">{t('revokeKeyConfirm')}</span>
                <button onClick={() => revokeMutation.mutate(k.id)} disabled={revokeMutation.isPending} className="px-2 py-1 text-caption rounded bg-[var(--color-critical)] text-white disabled:opacity-50">{t('revokeKey')}</button>
                <button onClick={() => setPendingRevoke(null)} className="px-2 py-1 text-caption rounded border border-[var(--border-default)] text-[var(--text-primary)]">{t('cancelWebhook')}</button>
              </span>
            ) : (
              <button
                onClick={() => setPendingRevoke(k.id)}
                className="p-1.5 text-[var(--color-critical-text)] hover:bg-[var(--color-critical-bg)] rounded"
                aria-label={t('revokeKeyLabel', { label: k.label })}
                title={t('revokeKeyLabel', { label: k.label })}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            ))}
          </li>
        ))}
        {!data?.keys?.length && <li className="text-caption text-[var(--text-secondary)] py-4 text-center">{t('noApiKeys')}</li>}
      </ul>
    </div>
  )
}

function AuditComplianceTab() {
  const t = useTranslations('settings')
  return (
    <div>
      <h3 className="text-heading text-[var(--text-primary)] mb-4">{t('auditCompliance')}</h3>
      <div className="space-y-3">
        {[
          { title: t('dataRetention'), desc: t('dataRetentionDesc') },
          { title: t('complianceReports'), desc: t('complianceReportsDesc') },
          { title: t('dataExport'), desc: t('dataExportDesc') },
        ].map(item => (
          <div key={item.title} className="p-3 rounded-md bg-[var(--bg-secondary)]">
            <p className="text-body text-[var(--text-primary)]">{item.title}</p>
            <p className="text-caption text-[var(--text-secondary)]">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const WEBHOOK_EVENT_TYPES = [
  'violation_detected',
  'threat_detected',
  'sync_failed',
  'certification_due',
] as const

function WebhooksTab() {
  const queryClient = useQueryClient()
  const t = useTranslations('settings')
  const format = useFormatter()
  const { can } = useRoleHint()
  const canManage = can('iam_admin')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['settings', 'webhooks'],
    queryFn: async () => { const r = await fetch('/api/webhooks'); return r.json() },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, secret: secret || undefined, events }),
      })
      return r.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] })
      setShowForm(false)
      setName('')
      setUrl('')
      setSecret('')
      setEvents([])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' })
      return r.json()
    },
    onSuccess: () => { setPendingDelete(null); queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] }) },
  })

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/webhooks/${id}`, { method: 'POST' })
      return r.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] }),
  })

  const toggleEvent = (event: string) => {
    setEvents(prev => prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event])
  }
  const eventLabel = (e: string) => (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e) ? t(`webhookEventNames.${e as typeof WEBHOOK_EVENT_TYPES[number]}`) : e

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-heading text-[var(--text-primary)]">{t('webhooksTitle')}</h3>
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            aria-expanded={showForm}
            className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-caption font-medium hover:opacity-90"
          >
            <Plus size={14} aria-hidden="true" /> {t('addWebhook')}
          </button>
        )}
      </div>
      {!canManage && <ReadOnlyNote role="iam_admin" />}

      {showForm && canManage && (
        <form className="mb-4 p-4 rounded-md bg-[var(--bg-secondary)] space-y-3" onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}>
          <label className="block">
            <span className="sr-only">{t('webhookNamePlaceholder')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('webhookNamePlaceholder')} className={`w-full ${inputClass}`} />
          </label>
          <label className="block">
            <span className="sr-only">{t('webhookUrlPlaceholder')}</span>
            <input type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('webhookUrlPlaceholder')} className={`w-full ${inputClass}`} />
          </label>
          <label className="block">
            <span className="sr-only">{t('webhookSecretPlaceholder')}</span>
            <input type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={t('webhookSecretPlaceholder')} className={`w-full ${inputClass}`} />
          </label>
          <fieldset>
            <legend className="text-caption text-[var(--text-secondary)] mb-1.5">{t('webhookEvents')}</legend>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENT_TYPES.map(event => (
                <button
                  type="button"
                  key={event}
                  onClick={() => toggleEvent(event)}
                  aria-pressed={events.includes(event)}
                  className={`px-2.5 py-1 rounded text-micro font-medium transition-colors ${
                    events.includes(event)
                      ? 'bg-[var(--color-info)] text-white'
                      : 'bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-secondary)]'
                  }`}
                >
                  {eventLabel(event)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!name || !url || !events.length || createMutation.isPending}
              className="px-4 py-2 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50"
            >
              {createMutation.isPending ? t('saving') : t('saveWebhook')}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-[var(--border-default)] rounded-[var(--radius-button)] text-body text-[var(--text-primary)]"
            >
              {t('cancelWebhook')}
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {data?.webhooks?.map((wh: any) => (
          <li key={wh.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-[var(--bg-secondary)]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-body font-medium text-[var(--text-primary)]"><bdi>{wh.name}</bdi></p>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-medium border text-[var(--text-primary)]"
                  style={{ borderColor: wh.enabled ? 'var(--color-low)' : 'var(--border-hover)' }}>
                  {wh.enabled ? t('webhookEnabled') : t('webhookDisabled')}
                </span>
              </div>
              <p className="text-micro text-[var(--text-secondary)] truncate" dir="ltr">{wh.url}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-micro text-[var(--text-secondary)]">
                  {(wh.events ?? []).map(eventLabel).join('، ')}
                </span>
                {wh.lastDeliveredAt && (
                  <span className="text-micro text-[var(--text-secondary)]">
                    | {t('webhookLastDelivery', { date: format.dateTime(new Date(wh.lastDeliveredAt), { dateStyle: 'medium' }), status: String(wh.lastStatus) })}
                  </span>
                )}
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-1 ms-3">
                <button
                  onClick={() => testMutation.mutate(wh.id)}
                  disabled={testMutation.isPending}
                  className="p-1.5 text-[var(--text-primary)] hover:bg-[var(--color-info-bg)] rounded"
                  title={t('testWebhook')}
                  aria-label={t('testWebhook')}
                >
                  {testMutation.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <TestTube2 size={14} aria-hidden="true" />}
                </button>
                {pendingDelete === wh.id ? (
                  <>
                    <button onClick={() => deleteMutation.mutate(wh.id)} className="px-2 py-1 text-caption rounded bg-[var(--color-critical)] text-white">{t('confirmDelete')}</button>
                    <button onClick={() => setPendingDelete(null)} className="px-2 py-1 text-caption rounded border border-[var(--border-default)] text-[var(--text-primary)]">{t('cancelWebhook')}</button>
                  </>
                ) : (
                  <button
                    onClick={() => setPendingDelete(wh.id)}
                    className="p-1.5 text-[var(--color-critical-text)] hover:bg-[var(--color-critical-bg)] rounded"
                    title={t('deleteWebhook')}
                    aria-label={t('deleteWebhook')}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
        {!data?.webhooks?.length && (
          <li className="text-caption text-[var(--text-secondary)] py-4 text-center">{t('noWebhooks')}</li>
        )}
      </ul>
    </div>
  )
}

const TRIGGER_TYPES = ['threshold_breach', 'data_change', 'time_elapsed', 'schedule'] as const
const ACTION_TYPES = ['create_alert', 'disable_identity', 'update_status', 'notify', 'create_violation'] as const

function AutomationTab() {
  const t = useTranslations('settings')
  const ta = useTranslations('settings.automationRules')
  const format = useFormatter()
  const { can } = useRoleHint()
  const canManage = can('iam_admin')
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newRule, setNewRule] = useState({ name: '', triggerType: 'threshold_breach', actionType: 'create_alert', enabled: true })

  const { data } = useQuery({
    queryKey: ['settings', 'automation-rules'],
    queryFn: async () => { const r = await fetch('/api/automation-rules'); return r.json() },
  })

  const createMutation = useMutation({
    mutationFn: async (rule: any) => {
      const r = await fetch('/api/automation-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      })
      return r.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'automation-rules'] })
      setShowCreate(false)
      setNewRule({ name: '', triggerType: 'threshold_breach', actionType: 'create_alert', enabled: true })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await fetch(`/api/automation-rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'automation-rules'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/automation-rules/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'automation-rules'] }),
  })

  const TEMPLATES = [
    { key: 'disableDormant', triggerType: 'time_elapsed', actionType: 'disable_identity', triggerCondition: { field: 'lastLogonAt', operator: '>', value: 90, unit: 'days' }, actionParams: { status: 'disabled' } },
    { key: 'alertTier0', triggerType: 'data_change', actionType: 'create_alert', triggerCondition: { field: 'adTierOfPermission', value: 'tier_0', event: 'created' }, actionParams: { severity: 'critical' } },
    { key: 'flagOrphanedNhi', triggerType: 'data_change', actionType: 'update_status', triggerCondition: { field: 'ownerStatus', value: 'disabled', identityType: 'non_human' }, actionParams: { status: 'orphaned' } },
    { key: 'escalateCritical', triggerType: 'time_elapsed', actionType: 'notify', triggerCondition: { field: 'violationAge', operator: '>', value: 4, unit: 'hours', severity: 'critical', status: 'open' }, actionParams: { notifyRole: 'ciso' } },
    { key: 'weeklyReview', triggerType: 'schedule', actionType: 'notify', triggerCondition: { cron: '0 9 * * 0' }, actionParams: { notifyRole: 'iam_admin', message: 'Weekly access review reminder' } },
  ] as const

  const triggerLabel = (v: string) => (TRIGGER_TYPES as readonly string[]).includes(v) ? ta(`triggers.${v as typeof TRIGGER_TYPES[number]}`) : v
  const actionLabel = (v: string) => (ACTION_TYPES as readonly string[]).includes(v) ? ta(`actions.${v as typeof ACTION_TYPES[number]}`) : v

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-heading text-[var(--text-primary)]">{ta('title')}</h3>
          <p className="text-caption text-[var(--text-secondary)] mt-1">{ta('description')}</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(!showCreate)} aria-expanded={showCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-info)] text-white rounded-[var(--radius-button)]">
            <Plus size={14} aria-hidden="true" /> {ta('createRule')}
          </button>
        )}
      </div>
      {!canManage && <ReadOnlyNote role="iam_admin" />}

      {showCreate && canManage && (
        <form className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-secondary)' }}
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ ...newRule, triggerCondition: {}, actionParams: {} }) }}>
          <label className="block">
            <span className="block text-caption text-[var(--text-secondary)] mb-1">{ta('ruleName')}</span>
            <input value={newRule.name} onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))} className={`w-full ${inputClass}`} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-caption text-[var(--text-secondary)] mb-1">{ta('trigger')}</span>
              <select value={newRule.triggerType} onChange={e => setNewRule(p => ({ ...p, triggerType: e.target.value }))} className={`w-full ${inputClass}`}>
                {TRIGGER_TYPES.map(v => <option key={v} value={v}>{triggerLabel(v)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-caption text-[var(--text-secondary)] mb-1">{ta('action')}</span>
              <select value={newRule.actionType} onChange={e => setNewRule(p => ({ ...p, actionType: e.target.value }))} className={`w-full ${inputClass}`}>
                {ACTION_TYPES.map(v => <option key={v} value={v}>{actionLabel(v)}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!newRule.name} className="px-4 py-2 text-xs font-medium bg-[var(--color-info)] text-white rounded-lg disabled:opacity-50">{ta('saveRule')}</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-medium rounded-lg text-[var(--text-primary)]" style={{ backgroundColor: 'var(--bg-tertiary)' }}>{t('cancelWebhook')}</button>
          </div>
        </form>
      )}

      {/* Pre-built templates */}
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">{ta('templates')}</h4>
        <ul className="grid gap-2">
          {TEMPLATES.map((tpl) => (
            <li key={tpl.key} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}>
              <div>
                <p className="text-xs font-medium text-[var(--text-primary)]">{ta(`templateNames.${tpl.key}`)}</p>
                <p className="text-[11px] text-[var(--text-secondary)]">{ta('triggerAction', { trigger: triggerLabel(tpl.triggerType), action: actionLabel(tpl.actionType) })}</p>
              </div>
              {canManage && (
                <button
                  onClick={() => createMutation.mutate({ ...tpl, key: undefined, name: ta(`templateNames.${tpl.key}`), enabled: true })}
                  className="px-3 py-1 text-[11px] font-medium rounded text-[var(--text-primary)] border border-[var(--border-default)]"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  {ta('activate')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Existing rules */}
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">{ta('activeRules')}</h4>
        {data?.rules?.length > 0 ? (
          <ul className="space-y-2">
            {data.rules.map((rule: any) => (
              <li key={rule.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border" style={{ borderColor: rule.enabled ? 'var(--color-info)' : 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  {canManage ? (
                    <button
                      role="switch"
                      aria-checked={!!rule.enabled}
                      aria-label={ta('toggleRule', { name: rule.name })}
                      onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                    >
                      {rule.enabled ? <ToggleRight size={20} style={{ color: 'var(--color-info-text)' }} aria-hidden="true" /> : <ToggleLeft size={20} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />}
                    </button>
                  ) : (
                    <span className="text-micro text-[var(--text-secondary)]">{rule.enabled ? t('webhookEnabled') : t('webhookDisabled')}</span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)]"><bdi>{rule.name}</bdi></p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {ta('triggeredCount', { count: rule.triggerCount || 0 })}
                      {rule.lastTriggeredAt ? ` · ${ta('lastTriggered', { date: format.dateTime(new Date(rule.lastTriggeredAt), { dateStyle: 'medium' }) })}` : ''}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => { if (window.confirm(ta('deleteConfirm', { name: rule.name }))) deleteMutation.mutate(rule.id) }} className="p-1 rounded hover:bg-[var(--bg-secondary)]" aria-label={ta('deleteRule', { name: rule.name })} title={ta('deleteRule', { name: rule.name })}>
                    <Trash2 size={14} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-[var(--text-secondary)] py-4 text-center">{ta('empty')}</p>
        )}
      </div>
    </div>
  )
}

function AppearanceTab() {
  const t = useTranslations('settings')
  const [theme, setTheme] = useState<string | null>(null)
  useEffect(() => {
    try { setTheme(localStorage.getItem('theme') || 'system') } catch { setTheme('system') }
  }, [])
  const currentLocale = typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en'
  return (
    <div>
      <h3 className="text-heading text-[var(--text-primary)] mb-4">{t('appearance')}</h3>
      <div className="space-y-4">
        <div role="group" aria-labelledby="theme-label">
          <p id="theme-label" className="text-caption font-medium text-[var(--text-primary)] mb-2">{t('theme')}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: t('light'), value: 'light' },
              { label: t('dark'), value: 'dark' },
              { label: t('system'), value: 'system' },
            ].map(opt => (
              <button key={opt.value}
                aria-pressed={theme === opt.value}
                className={`px-4 py-2 rounded-[var(--radius-button)] text-caption border bg-[var(--bg-primary)] text-[var(--text-primary)] ${theme === opt.value ? 'border-[var(--color-info)]' : 'border-[var(--border-default)] hover:border-[var(--border-hover)]'}`}
                onClick={() => {
                  const dark = opt.value === 'dark' || (opt.value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                  document.documentElement.classList.toggle('dark', dark)
                  try { localStorage.setItem('theme', opt.value) } catch { /* storage unavailable */ }
                  setTheme(opt.value)
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div role="group" aria-labelledby="language-label">
          <p id="language-label" className="text-caption font-medium text-[var(--text-primary)] mb-2">{t('language')}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'English', locale: 'en' as Locale },
              { label: 'العربية', locale: 'ar' as Locale },
            ].map(l => (
              <button key={l.locale} lang={l.locale}
                aria-pressed={currentLocale === l.locale}
                className={`px-4 py-2 rounded-[var(--radius-button)] text-caption border bg-[var(--bg-primary)] text-[var(--text-primary)] ${currentLocale === l.locale ? 'border-[var(--color-info)]' : 'border-[var(--border-default)] hover:border-[var(--border-hover)]'}`}
                onClick={() => setLocale(l.locale)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

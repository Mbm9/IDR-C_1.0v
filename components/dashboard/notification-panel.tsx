'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell, CheckCheck, AlertTriangle, AlertCircle, Info, Shield, Clock, Wifi, Loader2, Check, Eye, Search, RefreshCw, Play } from 'lucide-react'
import { useNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllRead } from '@/lib/hooks/use-notifications'
import type { Notification } from '@/lib/hooks/use-notifications'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useAppRole } from '@/lib/hooks/use-app-role'

const SEVERITY_STYLES: Record<string, { dot: string; icon: string }> = {
  critical: { dot: 'bg-[var(--color-critical)]', icon: 'text-[var(--color-critical-text)]' },
  high: { dot: 'bg-[var(--color-high)]', icon: 'text-[var(--color-high-text)]' },
  medium: { dot: 'bg-[var(--color-medium)]', icon: 'text-[var(--color-medium-text)]' },
  low: { dot: 'bg-[var(--color-low)]', icon: 'text-[var(--color-low-text)]' },
  info: { dot: 'bg-[var(--color-info)]', icon: 'text-[var(--color-info-text)]' },
}

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  violation_detected: AlertTriangle,
  certification_due: Clock,
  sync_failed: Wifi,
  exception_expiring: Shield,
  ai_analysis_complete: Info,
  system: AlertCircle,
  threat_detected: AlertCircle,
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: typeof Check
  label: string
  onClick: (e: React.MouseEvent) => void
  variant?: 'default' | 'primary'
}) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (loading || success) return
    setLoading(true)
    try {
      await onClick(e)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch {
      // error handled by caller
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-micro font-medium transition-colors disabled:opacity-50 ${
        variant === 'primary'
          ? 'bg-[var(--color-info)] text-white hover:opacity-90'
          : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-default)]'
      }`}
    >
      {loading ? (
        <Loader2 size={10} className="animate-spin" aria-hidden="true" />
      ) : success ? (
        <Check size={10} className="text-[var(--color-low-text)]" aria-hidden="true" />
      ) : (
        <Icon size={10} aria-hidden="true" />
      )}
      {label}
    </button>
  )
}

function NotificationActions({
  notification,
  onActionComplete,
}: {
  notification: Notification
  onActionComplete: () => void
}) {
  const router = useRouter()
  const t = useTranslations('notifications')
  const { can } = useAppRole()

  const handleAcknowledge = async () => {
    const violationId = (notification.metadata as any)?.violationId
    if (!violationId) return
    const res = await fetch('/api/actions/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ violationId }),
    })
    if (!res.ok) throw new Error('Failed to acknowledge')
    onActionComplete()
  }

  const handleContain = async () => {
    const threatId = (notification.metadata as any)?.threatId
    if (!threatId) return
    const res = await fetch(`/api/threats/${threatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contained' }),
    })
    if (!res.ok) throw new Error('Failed to contain threat')
    onActionComplete()
  }

  const handleRetrySync = async () => {
    const meta = (notification.metadata as any) || {}
    const integrationId = meta.integrationId || meta.sourceId
    if (!integrationId) return
    // POST /api/sync/[source] takes the integration id in the body; the path segment is the source type.
    const res = await fetch(`/api/sync/${encodeURIComponent(meta.sourceType || meta.type || 'source')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId }),
    })
    if (!res.ok) throw new Error('Failed to retry sync')
    onActionComplete()
  }

  switch (notification.type) {
    case 'violation_detected':
      return (
        <div className="flex items-center gap-1.5 mt-1.5">
          {can('analyst') && <ActionButton icon={Check} label={t('acknowledge')} onClick={handleAcknowledge} />}
          <ActionButton
            icon={Eye}
            label={t('view')}
            onClick={(e) => {
              e.stopPropagation()
              const violationId = (notification.metadata as any)?.violationId
              const identityId = (notification.metadata as any)?.identityId
              if (identityId) {
                router.push(`/dashboard/identities/${identityId}`)
              } else {
                router.push('/dashboard/violations')
              }
              onActionComplete()
            }}
          />
        </div>
      )

    case 'threat_detected':
      return (
        <div className="flex items-center gap-1.5 mt-1.5">
          <ActionButton
            icon={Search}
            label={t('investigate')}
            onClick={(e) => {
              e.stopPropagation()
              const threatId = (notification.metadata as any)?.threatId
              if (threatId) router.push(`/dashboard/threats/${threatId}`)
              else router.push('/dashboard/threats')
              onActionComplete()
            }}
          />
          {can('analyst') && <ActionButton icon={Shield} label={t('contain')} onClick={handleContain} variant="primary" />}
        </div>
      )

    case 'certification_due':
      return (
        <div className="flex items-center gap-1.5 mt-1.5">
          <ActionButton
            icon={Play}
            label={t('startReview')}
            onClick={(e) => {
              e.stopPropagation()
              router.push('/dashboard/certifications')
              onActionComplete()
            }}
            variant="primary"
          />
        </div>
      )

    case 'sync_failed':
      return (
        <div className="flex items-center gap-1.5 mt-1.5">
          {can('iam_admin') ? (
            <ActionButton icon={RefreshCw} label={t('retrySync')} onClick={handleRetrySync} variant="primary" />
          ) : (
            <ActionButton
              icon={Eye}
              label={t('view')}
              onClick={(e) => { e.stopPropagation(); router.push('/dashboard/integrations'); onActionComplete() }}
            />
          )}
        </div>
      )

    default:
      return null
  }
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification
  onRead: (id: string) => void
}) {
  const router = useRouter()
  const format = useFormatter()
  const severity = SEVERITY_STYLES[notification.severity] || SEVERITY_STYLES.info
  const Icon = TYPE_ICONS[notification.type] || Info

  const handleClick = () => {
    if (!notification.read) {
      onRead(notification.id)
    }
    if (notification.link) {
      router.push(notification.link)
    }
  }

  const handleActionComplete = () => {
    if (!notification.read) {
      onRead(notification.id)
    }
  }

  return (
    <li
      className={`w-full text-start px-3 py-2.5 transition-colors hover:bg-[var(--bg-secondary)] ${
        !notification.read ? 'bg-[var(--bg-secondary)]/50' : ''
      }`}
    >
      <button onClick={handleClick} className="w-full text-start">
        <div className="flex items-start gap-2.5">
          <div className={`mt-0.5 ${severity.icon}`} aria-hidden="true">
            <Icon size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p dir="auto" className={`text-caption leading-tight truncate ${
                !notification.read
                  ? 'font-semibold text-[var(--text-primary)]'
                  : 'font-medium text-[var(--text-secondary)]'
              }`}>
                {notification.title}
              </p>
              {!notification.read && (
                <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${severity.dot}`} aria-hidden="true" />
              )}
            </div>
            <p className="text-micro text-[var(--text-secondary)] mt-0.5 line-clamp-2" dir="auto">
              {notification.message}
            </p>
            <p className="text-micro text-[var(--text-secondary)] mt-1">
              <time dateTime={String(notification.createdAt)}>{format.relativeTime(new Date(notification.createdAt), Date.now())}</time>
            </p>
          </div>
        </div>
      </button>
      <NotificationActions notification={notification} onActionComplete={handleActionComplete} />
    </li>
  )
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('notifications')

  const { data: unreadCount = 0 } = useUnreadCount()
  const { data: notificationsData } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllRead()

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open])

  const handleMarkRead = (id: string) => {
    markRead.mutate(id)
  }

  const handleMarkAllRead = () => {
    markAllRead.mutate()
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors relative"
        title={t('title')}
        aria-label={unreadCount > 0 ? t('buttonLabelUnread', { count: unreadCount }) : t('title')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={16} aria-hidden="true" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[var(--color-critical)] text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('title')}
          className="absolute end-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] sm:w-96 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg z-50 overflow-hidden"
          style={{ boxShadow: 'var(--shadow-dropdown)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-default)]">
            <h3 className="text-caption font-semibold text-[var(--text-primary)]">
              {t('title')}
              {unreadCount > 0 && (
                <span className="ms-1.5 text-micro font-medium text-[var(--text-secondary)]">
                  {t('unread', { count: unreadCount })}
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1 text-micro text-[var(--text-primary)] underline-offset-2 hover:underline disabled:opacity-50"
              >
                <CheckCheck size={12} aria-hidden="true" />
                {t('markAllRead')}
              </button>
            )}
          </div>

          {/* Notification list */}
          <ul className="max-h-[400px] overflow-y-auto divide-y divide-[var(--border-default)]" tabIndex={0} aria-label={t('title')}>
            {!notificationsData?.data?.length ? (
              <li className="py-8 text-center">
                <Bell size={24} className="mx-auto mb-2 text-[var(--text-tertiary)] opacity-40" aria-hidden="true" />
                <p className="text-caption text-[var(--text-secondary)]">{t('empty')}</p>
              </li>
            ) : (
              notificationsData.data.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={handleMarkRead}
                />
              ))
            )}
          </ul>

          {/* Footer */}
          {notificationsData && notificationsData.total > notificationsData.data.length && (
            <div className="border-t border-[var(--border-default)] px-3 py-2 text-center">
              <button
                onClick={() => { setOpen(false) }}
                className="text-micro text-[var(--text-primary)] underline-offset-2 hover:underline"
              >
                {t('viewAll')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

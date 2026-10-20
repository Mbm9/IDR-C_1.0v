import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { notifications, webhookEndpoints, users } from '@/lib/db/schema'
import { eq, and, desc, count, SQL } from 'drizzle-orm'
import { sendWebhook } from '@/lib/webhooks/sender'
import { hasRole } from '@/lib/utils/rbac'
import { normalizeLocale, renderBriefingKey } from '@/lib/ai/briefing'
import type { AppRole } from '@/lib/utils/rbac'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(params.get('page') || '1'))
  const pageSize = Math.min(50, Math.max(1, parseInt(params.get('pageSize') || '20')))
  const offset = (page - 1) * pageSize

  const conditions: SQL[] = [
    eq(notifications.orgId, session.user.orgId),
    eq(notifications.userId, session.user.id),
  ]
  const where = and(...conditions)

  const [notificationList, totalResult, unreadResult] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(notifications).where(where),
    db.select({ total: count() }).from(notifications).where(
      and(...conditions, eq(notifications.read, false))
    ),
  ])

  // Notifications created with message keys (metadata.i18n) are rendered in
  // the reader's locale; English keeps the stored, more specific text.
  const locale = normalizeLocale(req.cookies.get('locale')?.value)
  const localized = locale === 'en' ? notificationList : notificationList.map((n) => {
    const i18n = (n.metadata as { i18n?: { titleKey?: string; messageKey?: string } } | null)?.i18n
    if (!i18n) return n
    return {
      ...n,
      title: (i18n.titleKey && renderBriefingKey(locale, i18n.titleKey)) || n.title,
      message: (i18n.messageKey && renderBriefingKey(locale, i18n.messageKey)) || n.message,
    }
  })

  return NextResponse.json({
    data: localized,
    total: totalResult[0]?.total ?? 0,
    unreadCount: unreadResult[0]?.total ?? 0,
    page,
    pageSize,
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Notifications are fanned out to the org's webhooks (SIEM, chat), so only
  // admins may create them by hand; system jobs insert directly.
  if (!hasRole((session.user.appRole ?? 'viewer') as AppRole, 'admin')) {
    return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { userId, type, title, message, severity, link, metadata } = body ?? {}

  if (!userId || !type || !title || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // In-app links must stay on this origin.
  if (link && (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//'))) {
    return NextResponse.json({ error: 'link must be a relative path' }, { status: 400 })
  }

  const [recipient] = await db.select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, session.user.orgId)))
    .limit(1)
  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found in this organization' }, { status: 404 })
  }

  const [created] = await db.insert(notifications).values({
    orgId: session.user.orgId,
    userId,
    type,
    title,
    message,
    severity: severity || 'info',
    link: link || null,
    metadata: metadata || null,
  }).returning()

  // Deliver to matching webhooks (fire-and-forget)
  deliverToWebhooks(session.user.orgId, created).catch((err) => {
    console.error('[Notification] Webhook delivery error:', err)
  })

  return NextResponse.json(created, { status: 201 })
}

async function deliverToWebhooks(orgId: string, notification: any) {
  const webhooks = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.enabled, true)))

  const matching = webhooks.filter(
    (wh) => wh.events && wh.events.includes(notification.type)
  )

  for (const wh of matching) {
    const payload = {
      event: notification.type,
      timestamp: new Date().toISOString(),
      data: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        severity: notification.severity,
        link: notification.link,
        metadata: notification.metadata,
      },
    }

    const success = await sendWebhook(wh.url, payload, wh.secret ?? undefined)
    await db
      .update(webhookEndpoints)
      .set({
        lastDeliveredAt: new Date(),
        lastStatus: success ? 200 : 500,
        failureCount: success ? 0 : wh.failureCount + 1,
      })
      .where(eq(webhookEndpoints.id, wh.id))
  }
}

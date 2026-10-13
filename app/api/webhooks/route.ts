import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { webhookEndpoints } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { assertSafeConnectorUrl } from '@/lib/connectors/url-guard'
import { z } from 'zod'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'

const createWebhookSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2048),
  secret: z.string().max(500).nullable().optional(),
  events: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const webhooks = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.orgId, session.user.orgId))

  // Never expose the signing secret to the client — return only whether one is set.
  const sanitized = webhooks.map(({ secret, ...rest }) => ({ ...rest, hasSecret: !!secret }))
  return NextResponse.json({ webhooks: sanitized })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Webhooks are an outbound-request + data-egress channel — restrict to integration admins.
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
  }

  const parsed = await parseJsonBody(req, createWebhookSchema)
  if (!parsed.ok) return parsed.response
  const { name, url, secret, events } = parsed.data

  // SSRF guard: block loopback / link-local / cloud-metadata destinations.
  try {
    assertSafeConnectorUrl(url)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Invalid webhook URL' }, { status: 400 })
  }

  const [created] = await db.insert(webhookEndpoints).values({
    name,
    url,
    secret: secret || null,
    events,
    orgId: session.user.orgId,
  }).returning()

  // Never log the signing secret or the full URL (it may embed tokens) — host only.
  await logAction({
    actionType: 'manage_webhook',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    payload: { operation: 'create', webhookId: created.id, name, host: safeHost(url), events, hasSecret: !!created.secret },
  })

  const { secret: _s, ...safe } = created
  return NextResponse.json({ ...safe, hasSecret: !!created.secret }, { status: 201 })
}

function safeHost(url: string): string | null {
  try { return new URL(url).host } catch { return null }
}

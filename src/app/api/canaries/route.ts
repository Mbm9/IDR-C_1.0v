import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { db } from '@/lib/db'
import { canaryIdentities, canaryTriggers, identities } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'

const createSchema = z.object({
  canaryType: z.enum(['fake_admin', 'fake_service', 'fake_gmsa', 'fake_vpn', 'fake_api_key']),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  placementLocation: z.string().trim().min(1).max(500),
  // The create form posts '' when no alert URL is given.
  alertWebhookUrl: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId

  try {
    const results = await db
      .select({
        id: canaryIdentities.id,
        identityId: canaryIdentities.identityId,
        identityName: identities.displayName,
        canaryType: canaryIdentities.canaryType,
        description: canaryIdentities.description,
        placementLocation: canaryIdentities.placementLocation,
        enabled: canaryIdentities.enabled,
        triggerCount: canaryIdentities.triggerCount,
        lastTriggeredAt: canaryIdentities.lastTriggeredAt,
        lastTriggeredSourceIp: canaryIdentities.lastTriggeredSourceIp,
        alertWebhookUrl: canaryIdentities.alertWebhookUrl,
        createdAt: canaryIdentities.createdAt,
      })
      .from(canaryIdentities)
      .innerJoin(identities, eq(canaryIdentities.identityId, identities.id))
      .where(eq(canaryIdentities.orgId, orgId))
      .orderBy(desc(canaryIdentities.createdAt))

    // Stats
    const total = results.length
    const active = results.filter(r => r.enabled).length
    const triggeredEver = results.filter(r => r.triggerCount > 0).length
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const triggered24h = results.filter(r =>
      r.lastTriggeredAt && new Date(r.lastTriggeredAt) > oneDayAgo
    ).length

    return NextResponse.json({
      items: results,
      stats: { total, active, triggeredEver, triggered24h },
    })
  } catch (error) {
    console.error('Canaries GET error:', error)
    return NextResponse.json({ error: 'Failed to load canaries' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
  }

  const orgId = session.user.orgId
  const parsed = await parseJsonBody(req, createSchema)
  if (!parsed.ok) return parsed.response

  const { canaryType, name, description, placementLocation, alertWebhookUrl } = parsed.data

  try {
    // Map canary type to identity sub-type
    const subTypeMap: Record<string, 'service_account' | 'managed_identity' | 'api_key'> = {
      fake_admin: 'service_account',
      fake_service: 'service_account',
      fake_gmsa: 'managed_identity',
      fake_vpn: 'service_account',
      fake_api_key: 'api_key',
    }

    // Create the identity record
    const [identity] = await db.insert(identities).values({
      displayName: name,
      type: 'non_human',
      subType: subTypeMap[canaryType] || 'service_account',
      status: 'active',
      adTier: canaryType === 'fake_admin' ? 'tier_0' : 'tier_2',
      riskScore: 0,
      sourceSystem: 'manual',
      sourceId: `CANARY-${Date.now()}`,
      samAccountName: name.toLowerCase().replace(/\s+/g, '-'),
      orgId,
    }).returning()

    // Create the canary record
    const [canary] = await db.insert(canaryIdentities).values({
      identityId: identity.id,
      canaryType,
      description,
      placementLocation,
      alertWebhookUrl: alertWebhookUrl || null,
      orgId,
    }).returning()

    // Never log the alert URL itself: chat/SIEM webhook URLs embed credentials.
    await logAction({
      actionType: 'manage_canary',
      actorIdentityId: session.user.id,
      orgId,
      targetIdentityId: identity.id,
      payload: {
        operation: 'create',
        canaryId: canary.id,
        identityId: identity.id,
        canaryType,
        name,
        placementLocation,
        hasAlertWebhook: !!alertWebhookUrl,
      },
    })

    return NextResponse.json({ success: true, canary: { ...canary, identityName: name } })
  } catch (error) {
    console.error('Canary create error:', error)
    return NextResponse.json({ error: 'Failed to create canary' }, { status: 500 })
  }
}

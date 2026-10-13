import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { db } from '@/lib/db'
import { canaryIdentities, canaryTriggers, identities } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  alertWebhookUrl: z.string().url().nullable().optional(),
  description: z.string().trim().min(1).max(2000).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const [canary] = await db
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
      .where(and(eq(canaryIdentities.id, id), eq(canaryIdentities.orgId, session.user.orgId)))

    if (!canary) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Recent triggers
    const triggers = await db
      .select()
      .from(canaryTriggers)
      .where(eq(canaryTriggers.canaryId, id))
      .orderBy(desc(canaryTriggers.triggeredAt))
      .limit(20)

    return NextResponse.json({ ...canary, recentTriggers: triggers })
  } catch (error) {
    console.error('Canary detail error:', error)
    return NextResponse.json({ error: 'Failed to load canary' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
  }

  const { id } = await params
  const parsed = await parseJsonBody(req, updateSchema)
  if (!parsed.ok) return parsed.response

  try {
    const [existing] = await db
      .select()
      .from(canaryIdentities)
      .where(and(eq(canaryIdentities.id, id), eq(canaryIdentities.orgId, session.user.orgId)))

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled
    if (parsed.data.alertWebhookUrl !== undefined) updateData.alertWebhookUrl = parsed.data.alertWebhookUrl
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description

    await db.update(canaryIdentities).set(updateData).where(eq(canaryIdentities.id, id))

    await logAction({
      actionType: 'manage_canary',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      targetIdentityId: existing.identityId,
      payload: {
        operation: 'update',
        canaryId: id,
        changedFields: Object.keys(updateData).filter((k) => k !== 'updatedAt'),
        ...(parsed.data.enabled !== undefined && {
          previousEnabled: existing.enabled,
          newEnabled: parsed.data.enabled,
        }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Canary update error:', error)
    return NextResponse.json({ error: 'Failed to update canary' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
  }

  const { id } = await params

  try {
    const [existing] = await db
      .select()
      .from(canaryIdentities)
      .where(and(eq(canaryIdentities.id, id), eq(canaryIdentities.orgId, session.user.orgId)))

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Soft delete: disable canary and identity
    await db.update(canaryIdentities)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(canaryIdentities.id, id))

    await db.update(identities)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(eq(identities.id, existing.identityId))

    await logAction({
      actionType: 'manage_canary',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      targetIdentityId: existing.identityId,
      payload: { operation: 'retire', canaryId: id, identityId: existing.identityId, previousEnabled: existing.enabled },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Canary delete error:', error)
    return NextResponse.json({ error: 'Failed to delete canary' }, { status: 500 })
  }
}

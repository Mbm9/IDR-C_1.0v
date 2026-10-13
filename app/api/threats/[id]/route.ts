import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identityThreats, identities, detectionRules } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, parseJsonBody } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'
import { z } from 'zod'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId
    const { id } = params

    const [threat] = await db
      .select()
      .from(identityThreats)
      .where(and(eq(identityThreats.id, id), eq(identityThreats.orgId, orgId)))
      .limit(1)

    if (!threat) {
      return NextResponse.json({ error: 'Threat not found' }, { status: 404 })
    }

    // Load linked identity
    const [identity] = await db
      .select()
      .from(identities)
      .where(eq(identities.id, threat.identityId))
      .limit(1)

    // Load detection rule if present
    let rule = null
    if (threat.detectionRuleId) {
      const [r] = await db
        .select()
        .from(detectionRules)
        .where(eq(detectionRules.id, threat.detectionRuleId))
        .limit(1)
      rule = r || null
    }

    return NextResponse.json({ threat, identity, detectionRule: rule })
  } catch (err: any) {
    console.error('[Threat GET] Error:', err)
    return NextResponse.json({ error: 'Failed to load threat', details: err.message }, { status: 500 })
  }
}

const VALID_STATUSES = ['active', 'investigating', 'contained', 'resolved', 'false_positive'] as const

const patchThreatSchema = z.object({
  status: z.enum(VALID_STATUSES),
  rationale: z.string().max(2000).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

    const orgId = session.user.orgId
    const { id } = params
    const parsed = await parseJsonBody(req, patchThreatSchema)
    if (!parsed.ok) return parsed.response
    const { status, rationale } = parsed.data

    // Verify threat belongs to org
    const [existing] = await db
      .select({ id: identityThreats.id, identityId: identityThreats.identityId, status: identityThreats.status, threatType: identityThreats.threatType })
      .from(identityThreats)
      .where(and(eq(identityThreats.id, id), eq(identityThreats.orgId, orgId)))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Threat not found' }, { status: 404 })
    }

    const updates: Partial<typeof identityThreats.$inferInsert> = {
      status,
    }

    // resolvedBy is an FK to identities and app users are not identities, so the
    // resolving user is recorded in the action_log entry below instead.
    if (status === 'resolved' || status === 'false_positive') {
      updates.resolvedAt = new Date()
    }

    const [updated] = await db
      .update(identityThreats)
      .set(updates)
      .where(eq(identityThreats.id, id))
      .returning()

    await logAction({
      actionType: 'update_threat_status',
      actorIdentityId: session.user.id,
      orgId,
      targetIdentityId: existing.identityId,
      rationale: rationale || `Threat status changed to ${status}`,
      payload: { threatId: id, threatType: existing.threatType, previousStatus: existing.status, newStatus: status },
      source: 'manual',
    })

    return NextResponse.json(updated)
  } catch (err: any) {
    console.error('[Threat PATCH] Error:', err)
    return NextResponse.json({ error: 'Failed to update threat', details: err.message }, { status: 500 })
  }
}

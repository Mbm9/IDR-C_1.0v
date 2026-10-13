import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { db } from '@/lib/db'
import { shadowAdmins, identities } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'

const patchSchema = z.object({
  status: z.enum(['confirmed', 'dismissed', 'remediated']),
  rationale: z.string().max(2000).optional(),
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
    const [result] = await db
      .select({
        id: shadowAdmins.id,
        identityId: shadowAdmins.identityId,
        identityName: identities.displayName,
        identityType: identities.type,
        identitySubType: identities.subType,
        identityTier: identities.adTier,
        identityRiskScore: identities.riskScore,
        detectionMethod: shadowAdmins.detectionMethod,
        detectionReasons: shadowAdmins.detectionReasons,
        effectiveRights: shadowAdmins.effectiveRights,
        equivalentToGroups: shadowAdmins.equivalentToGroups,
        riskScore: shadowAdmins.riskScore,
        status: shadowAdmins.status,
        confirmedBy: shadowAdmins.confirmedBy,
        confirmedAt: shadowAdmins.confirmedAt,
        detectedAt: shadowAdmins.detectedAt,
      })
      .from(shadowAdmins)
      .innerJoin(identities, eq(shadowAdmins.identityId, identities.id))
      .where(and(eq(shadowAdmins.id, id), eq(shadowAdmins.orgId, session.user.orgId)))

    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Shadow admin detail error:', error)
    return NextResponse.json({ error: 'Failed to load shadow admin' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) {
    return NextResponse.json({ error: 'Forbidden: analyst role required' }, { status: 403 })
  }

  const { id } = await params
  const parsed = await parseJsonBody(req, patchSchema)
  if (!parsed.ok) return parsed.response

  try {
    const [existing] = await db
      .select()
      .from(shadowAdmins)
      .where(and(eq(shadowAdmins.id, id), eq(shadowAdmins.orgId, session.user.orgId)))

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await db.update(shadowAdmins)
      .set({
        status: parsed.data.status,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shadowAdmins.id, id))

    await logAction({
      actionType: 'update_finding_status',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      targetIdentityId: existing.identityId,
      payload: {
        findingType: 'shadow_admin',
        shadowAdminId: id,
        previousStatus: existing.status,
        newStatus: parsed.data.status,
        detectionMethod: existing.detectionMethod,
      },
      rationale: parsed.data.rationale || `Shadow admin status changed to ${parsed.data.status}`,
    })

    return NextResponse.json({ success: true, status: parsed.data.status })
  } catch (error) {
    console.error('Shadow admin patch error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

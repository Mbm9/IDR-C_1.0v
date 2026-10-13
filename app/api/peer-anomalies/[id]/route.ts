import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { db } from '@/lib/db'
import { peerAnomalies, peerGroups, identities } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'

const patchSchema = z.object({
  status: z.enum(['reviewed', 'dismissed', 'remediated']),
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
        id: peerAnomalies.id,
        identityId: peerAnomalies.identityId,
        identityName: identities.displayName,
        identityTier: identities.adTier,
        identityDepartment: identities.department,
        peerGroupId: peerAnomalies.peerGroupId,
        peerGroupName: peerGroups.name,
        peerMedianCount: peerGroups.medianEntitlementCount,
        peerAvgCount: peerGroups.avgEntitlementCount,
        peerStddev: peerGroups.stddevEntitlementCount,
        anomalyType: peerAnomalies.anomalyType,
        entitlementCount: peerAnomalies.entitlementCount,
        peerMedian: peerAnomalies.peerMedian,
        deviationScore: peerAnomalies.deviationScore,
        excessEntitlements: peerAnomalies.excessEntitlements,
        uniqueEntitlements: peerAnomalies.uniqueEntitlements,
        status: peerAnomalies.status,
        aiNarrative: peerAnomalies.aiNarrative,
        detectedAt: peerAnomalies.detectedAt,
      })
      .from(peerAnomalies)
      .innerJoin(identities, eq(peerAnomalies.identityId, identities.id))
      .innerJoin(peerGroups, eq(peerAnomalies.peerGroupId, peerGroups.id))
      .where(and(eq(peerAnomalies.id, id), eq(peerAnomalies.orgId, session.user.orgId)))

    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Peer anomaly detail error:', error)
    return NextResponse.json({ error: 'Failed to load anomaly' }, { status: 500 })
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
      .from(peerAnomalies)
      .where(and(eq(peerAnomalies.id, id), eq(peerAnomalies.orgId, session.user.orgId)))

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await db.update(peerAnomalies)
      .set({ status: parsed.data.status })
      .where(eq(peerAnomalies.id, id))

    await logAction({
      actionType: 'update_finding_status',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      targetIdentityId: existing.identityId,
      payload: {
        findingType: 'peer_anomaly',
        peerAnomalyId: id,
        anomalyType: existing.anomalyType,
        previousStatus: existing.status,
        newStatus: parsed.data.status,
      },
      rationale: parsed.data.rationale || `Peer anomaly status changed to ${parsed.data.status}`,
    })

    return NextResponse.json({ success: true, status: parsed.data.status })
  } catch (error) {
    console.error('Peer anomaly patch error:', error)
    return NextResponse.json({ error: 'Failed to update anomaly' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { peerAnomalies, peerGroups, identities } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const params = req.nextUrl.searchParams
  const status = params.get('status')
  const peerGroupId = params.get('peerGroupId')

  try {
    const conditions = [eq(peerAnomalies.orgId, orgId)]
    if (status) conditions.push(eq(peerAnomalies.status, status))
    if (peerGroupId) conditions.push(eq(peerAnomalies.peerGroupId, peerGroupId))

    const results = await db
      .select({
        id: peerAnomalies.id,
        identityId: peerAnomalies.identityId,
        identityName: identities.displayName,
        identityTier: identities.adTier,
        identityDepartment: identities.department,
        peerGroupId: peerAnomalies.peerGroupId,
        peerGroupName: peerGroups.name,
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
      .where(and(...conditions))
      .orderBy(desc(peerAnomalies.deviationScore))

    return NextResponse.json({ items: results })
  } catch (error) {
    console.error('Peer anomalies GET error:', error)
    return NextResponse.json({ error: 'Failed to load peer anomalies' }, { status: 500 })
  }
}

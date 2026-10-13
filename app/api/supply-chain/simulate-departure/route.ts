import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities, entitlements, resources } from '@/lib/db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { z } from 'zod'

const inputSchema = z.object({
  identityId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const body = await req.json()
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const { identityId } = parsed.data

  try {
    const [owner] = await db
      .select()
      .from(identities)
      .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))

    if (!owner) {
      return NextResponse.json({ error: 'Identity not found' }, { status: 404 })
    }

    // NHIs that would become orphaned
    const affectedNhis = await db
      .select({
        id: identities.id,
        name: identities.displayName,
        subType: identities.subType,
        tier: identities.adTier,
        status: identities.status,
      })
      .from(identities)
      .where(and(
        eq(identities.ownerIdentityId, identityId),
        eq(identities.type, 'non_human'),
        eq(identities.orgId, orgId),
      ))

    const nhiIds = affectedNhis.map(n => n.id)

    // Resources that would lose their owner chain
    let affectedResources: { id: string; name: string; type: string; tier: string; criticality: string }[] = []
    if (nhiIds.length > 0) {
      affectedResources = await db
        .select({
          id: resources.id,
          name: resources.name,
          type: resources.type,
          tier: resources.adTier,
          criticality: resources.criticality,
        })
        .from(resources)
        .innerJoin(entitlements, eq(entitlements.resourceId, resources.id))
        .where(inArray(entitlements.identityId, nhiIds))
    }

    // Deduplicate resources
    const uniqueResources = Array.from(
      new Map(affectedResources.map(r => [r.id, r])).values()
    )

    // Identities managed by this person (direct reports)
    const directReports = await db
      .select({
        id: identities.id,
        name: identities.displayName,
        tier: identities.adTier,
      })
      .from(identities)
      .where(and(
        eq(identities.managerIdentityId, identityId),
        eq(identities.orgId, orgId),
      ))

    // Recommended transfers (find other humans in same department)
    const transferCandidates = await db
      .select({
        id: identities.id,
        name: identities.displayName,
        department: identities.department,
      })
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.type, 'human'),
        eq(identities.status, 'active'),
        eq(identities.department, owner.department || ''),
        sql`${identities.id} != ${identityId}`,
      ))
      .limit(5)

    return NextResponse.json({
      departingIdentity: {
        id: owner.id,
        name: owner.displayName,
        department: owner.department,
        tier: owner.adTier,
      },
      impact: {
        orphanedNhis: affectedNhis,
        affectedResources: uniqueResources,
        directReports,
        criticalResourceCount: uniqueResources.filter(
          r => r.tier === 'tier_0' || r.criticality === 'critical'
        ).length,
      },
      recommendations: {
        transferCandidates,
        suggestedActions: [
          affectedNhis.length > 0 ? `Transfer ownership of ${affectedNhis.length} NHIs before departure` : null,
          directReports.length > 0 ? `Reassign ${directReports.length} direct reports to a new manager` : null,
          uniqueResources.some(r => r.tier === 'tier_0') ? 'URGENT: Tier 0 resources will be impacted - immediate action required' : null,
          'Rotate credentials for all owned service accounts',
          'Update runbooks and documentation',
        ].filter(Boolean),
      },
    })
  } catch (error) {
    console.error('Simulate departure error:', error)
    return NextResponse.json({ error: 'Failed to simulate departure' }, { status: 500 })
  }
}

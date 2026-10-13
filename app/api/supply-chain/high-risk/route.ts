import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities, entitlements, resources } from '@/lib/db/schema'
import { eq, and, sql, desc, inArray } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId

  try {
    // Find humans who own NHIs
    const owners = await db
      .select({
        ownerId: identities.ownerIdentityId,
        nhiCount: sql<number>`count(*)::int`,
      })
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.type, 'non_human'),
        sql`${identities.ownerIdentityId} IS NOT NULL`,
      ))
      .groupBy(identities.ownerIdentityId)
      .orderBy(desc(sql`count(*)`))

    // For each owner, compute critical resource count
    const results = await Promise.all(
      owners.slice(0, 20).map(async (o) => {
        if (!o.ownerId) return null

        const [ownerIdentity] = await db
          .select({
            id: identities.id,
            name: identities.displayName,
            department: identities.department,
            tier: identities.adTier,
          })
          .from(identities)
          .where(eq(identities.id, o.ownerId))

        if (!ownerIdentity) return null

        // Find owned NHI ids
        const ownedNhis = await db
          .select({ id: identities.id })
          .from(identities)
          .where(and(
            eq(identities.ownerIdentityId, o.ownerId),
            eq(identities.type, 'non_human'),
          ))

        const nhiIds = ownedNhis.map(n => n.id)
        if (nhiIds.length === 0) return null

        // Count critical resources reachable through NHIs
        const criticalResources = await db
          .select({
            count: sql<number>`count(DISTINCT ${resources.id})::int`,
          })
          .from(entitlements)
          .innerJoin(resources, eq(entitlements.resourceId, resources.id))
          .where(and(
            inArray(entitlements.identityId, nhiIds),
            sql`(${resources.adTier} IN ('tier_0', 'tier_top') OR ${resources.criticality} = 'critical')`,
          ))

        return {
          owner: ownerIdentity,
          nhiCount: o.nhiCount,
          criticalResourceCount: criticalResources[0]?.count || 0,
          successionPlan: false,
        }
      })
    )

    const filtered = results.filter(Boolean)
    filtered.sort((a, b) => (b!.criticalResourceCount - a!.criticalResourceCount))

    return NextResponse.json({ items: filtered })
  } catch (error) {
    console.error('Supply chain high-risk error:', error)
    return NextResponse.json({ error: 'Failed to load high-risk owners' }, { status: 500 })
  }
}

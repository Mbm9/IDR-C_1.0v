import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { entitlements, identities, resources } from '@/lib/db/schema'
import { eq, and, count, desc, sql, gt, lt } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orgId = session.user.orgId

  const [
    certBreakdown,
    permissionTypes,
    unusedEntitlements,
    overProvisionedIdentities,
    riskTagged,
  ] = await Promise.all([
    db.select({ status: entitlements.certificationStatus, count: count() })
      .from(entitlements).where(eq(entitlements.orgId, orgId))
      .groupBy(entitlements.certificationStatus),

    db.select({ type: entitlements.permissionType, count: count() })
      .from(entitlements).where(eq(entitlements.orgId, orgId))
      .groupBy(entitlements.permissionType),

    db.select({
      id: entitlements.id,
      permissionName: entitlements.permissionName,
      identityName: identities.displayName,
      identityId: identities.id,
      resourceName: resources.name,
      lastUsedAt: entitlements.lastUsedAt,
      adTierOfPermission: entitlements.adTierOfPermission,
    }).from(entitlements)
      .leftJoin(identities, eq(entitlements.identityId, identities.id))
      .leftJoin(resources, eq(entitlements.resourceId, resources.id))
      .where(and(
        eq(entitlements.orgId, orgId),
        lt(entitlements.lastUsedAt, sql`NOW() - INTERVAL '90 days'`),
      ))
      .orderBy(entitlements.lastUsedAt)
      .limit(50),

    db.select({
      identityId: identities.id,
      identityName: identities.displayName,
      entitlementCount: count(),
    }).from(entitlements)
      .innerJoin(identities, eq(entitlements.identityId, identities.id))
      .where(eq(entitlements.orgId, orgId))
      .groupBy(identities.id, identities.displayName)
      .having(gt(count(), sql`(SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cnt) FROM (SELECT COUNT(*) as cnt FROM entitlements WHERE org_id = ${orgId} GROUP BY identity_id) sub) * 2`))
      .orderBy(desc(count()))
      .limit(25),

    db.select({ count: count() }).from(entitlements)
      .where(and(
        eq(entitlements.orgId, orgId),
        sql`array_length(${entitlements.riskTags}, 1) > 0`,
      )),
  ])

  return NextResponse.json({
    certificationBreakdown: Object.fromEntries(certBreakdown.map(c => [c.status, Number(c.count)])),
    permissionTypes: Object.fromEntries(permissionTypes.map(p => [p.type, Number(p.count)])),
    unusedEntitlements,
    overProvisionedIdentities,
    riskTaggedCount: Number(riskTagged[0]?.count ?? 0),
  })
}

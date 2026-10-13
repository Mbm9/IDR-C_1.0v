import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities } from '@/lib/db/schema'
import { eq, and, count, desc, sql, isNull, lt } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orgId = session.user.orgId

  const [
    nhis,
    ownershipStats,
    expiryData,
    privilegedNhis,
  ] = await Promise.all([
    db.select().from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.type, 'non_human')))
      .orderBy(desc(identities.riskScore)),

    db.select({
      status: sql<string>`CASE WHEN ${identities.ownerIdentityId} IS NULL THEN 'orphaned' WHEN ${identities.status} = 'orphaned' THEN 'owner_disabled' ELSE 'owned' END`,
      count: count(),
    }).from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.type, 'non_human')))
      .groupBy(sql`CASE WHEN ${identities.ownerIdentityId} IS NULL THEN 'orphaned' WHEN ${identities.status} = 'orphaned' THEN 'owner_disabled' ELSE 'owned' END`),

    db.select({
      expired: sql<number>`COUNT(*) FILTER (WHERE ${identities.expiryAt} < NOW() AND ${identities.status} = 'active')`,
      expiringSoon: sql<number>`COUNT(*) FILTER (WHERE ${identities.expiryAt} BETWEEN NOW() AND NOW() + INTERVAL '30 days')`,
      total: count(),
    }).from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.type, 'non_human'))),

    db.select({ count: count() }).from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.type, 'non_human'),
        sql`${identities.adTier} IN ('tier_0', 'tier_top', 'tier_1')`,
      )),
  ])

  return NextResponse.json({
    nhis,
    ownership: Object.fromEntries(ownershipStats.map(s => [s.status, Number(s.count)])),
    expiry: {
      expired: Number(expiryData[0]?.expired ?? 0),
      expiringSoon: Number(expiryData[0]?.expiringSoon ?? 0),
      total: Number(expiryData[0]?.total ?? 0),
    },
    privilegedCount: Number(privilegedNhis[0]?.count ?? 0),
  })
}

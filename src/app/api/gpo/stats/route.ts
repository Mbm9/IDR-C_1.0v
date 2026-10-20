import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { gpoObjects, gpoLinks, gpoPermissions, identities } from '@/lib/db/schema'
import { eq, and, sql, notInArray } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

// GET: Aggregate GPO stats
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId

    // Total GPOs by tier
    const tierCounts = await db
      .select({
        tier: gpoObjects.adTier,
        count: sql<number>`count(*)::int`,
      })
      .from(gpoObjects)
      .where(eq(gpoObjects.orgId, orgId))
      .groupBy(gpoObjects.adTier)

    const byTier: Record<string, number> = {}
    let total = 0
    for (const row of tierCounts) {
      byTier[row.tier] = row.count
      total += row.count
    }

    // GPOs with dangerous permissions
    const [{ dangerousCount }] = await db
      .select({
        dangerousCount: sql<number>`count(DISTINCT ${gpoPermissions.gpoId})::int`,
      })
      .from(gpoPermissions)
      .where(and(
        eq(gpoPermissions.orgId, orgId),
        eq(gpoPermissions.dangerous, true)
      ))

    // Enforced GPOs
    const [{ enforcedCount }] = await db
      .select({ enforcedCount: sql<number>`count(*)::int` })
      .from(gpoObjects)
      .where(and(eq(gpoObjects.orgId, orgId), eq(gpoObjects.status, 'enforced')))

    // Unlinked GPOs (no links)
    const linkedGpoIds = db
      .select({ gpoId: gpoLinks.gpoId })
      .from(gpoLinks)
      .where(eq(gpoLinks.orgId, orgId))

    const [{ unlinkedCount }] = await db
      .select({ unlinkedCount: sql<number>`count(*)::int` })
      .from(gpoObjects)
      .where(and(
        eq(gpoObjects.orgId, orgId),
        sql`${gpoObjects.id} NOT IN (SELECT gpo_id FROM gpo_links WHERE org_id = ${orgId})`
      ))

    // GPOs with no owner
    const [{ noOwnerCount }] = await db
      .select({ noOwnerCount: sql<number>`count(*)::int` })
      .from(gpoObjects)
      .where(and(
        eq(gpoObjects.orgId, orgId),
        sql`${gpoObjects.ownerIdentityId} IS NULL`
      ))

    // GPOs modifiable by non-admin identities (T2 with edit_settings or modify_security)
    const [{ nonAdminModifiable }] = await db
      .select({
        nonAdminModifiable: sql<number>`count(DISTINCT ${gpoPermissions.gpoId})::int`,
      })
      .from(gpoPermissions)
      .innerJoin(identities, eq(gpoPermissions.trusteeIdentityId, identities.id))
      .where(and(
        eq(gpoPermissions.orgId, orgId),
        sql`${gpoPermissions.permissionType} IN ('edit_settings', 'modify_security', 'full_control')`,
        eq(identities.adTier, 'tier_2')
      ))

    return NextResponse.json({
      total,
      byTier,
      dangerousCount,
      enforcedCount,
      unlinkedCount,
      noOwnerCount,
      nonAdminModifiable,
    })
  } catch (error) {
    console.error('[GPO Stats] GET error:', error)
    return NextResponse.json({ error: 'Failed to get GPO stats' }, { status: 500 })
  }
}

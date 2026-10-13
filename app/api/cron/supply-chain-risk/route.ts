import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identities, entitlements, resources, policyViolations, policies, organizations } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'
import { isControlPlaneTier } from '@/lib/utils/tiers'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalViolations = 0

    for (const org of allOrgs) {
      const orgId = org.id

      // Find NHIs that access T0/critical resources and have only one owner
      const singleOwnerNhis = await db
        .select({
          nhiId: identities.id,
          nhiName: identities.displayName,
          ownerId: identities.ownerIdentityId,
          nhiTier: identities.adTier,
        })
        .from(identities)
        .where(and(
          eq(identities.orgId, orgId),
          eq(identities.type, 'non_human'),
          eq(identities.status, 'active'),
          sql`${identities.ownerIdentityId} IS NOT NULL`,
        ))

      // Check which NHIs access control-plane (T0 / Top Tier) or critical resources
      for (const nhi of singleOwnerNhis) {
        const t0Access = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(entitlements)
          .innerJoin(resources, eq(entitlements.resourceId, resources.id))
          .where(and(
            eq(entitlements.identityId, nhi.nhiId),
            sql`(${resources.adTier} IN ('tier_0', 'tier_top') OR ${resources.criticality} = 'critical')`,
          ))

        if ((t0Access[0]?.count || 0) > 0) {
          // Check if there's already an open violation for this
          const existing = await db
            .select({ id: policyViolations.id })
            .from(policyViolations)
            .where(and(
              eq(policyViolations.identityId, nhi.nhiId),
              eq(policyViolations.violationType, 'orphaned_identity'),
              eq(policyViolations.status, 'open'),
              eq(policyViolations.orgId, orgId),
            ))
            .limit(1)

          if (existing.length === 0) {
            // Find or create a suitable policy
            const [policy] = await db
              .select({ id: policies.id })
              .from(policies)
              .where(and(
                eq(policies.orgId, orgId),
                eq(policies.type, 'lifecycle_policy'),
              ))
              .limit(1)

            if (policy) {
              await db.insert(policyViolations).values({
                policyId: policy.id,
                identityId: nhi.nhiId,
                violationType: 'orphaned_identity', // closest existing type for supply chain risk
                severity: isControlPlaneTier(nhi.nhiTier) ? 'critical' : 'high',
                status: 'open',
                orgId,
              })
              totalViolations++
            }
          }
        }
      }

      // Also flag NHIs with no owner at all that access T0
      const orphanedT0Nhis = await db
        .select({ id: identities.id })
        .from(identities)
        .where(and(
          eq(identities.orgId, orgId),
          eq(identities.type, 'non_human'),
          eq(identities.status, 'active'),
          sql`${identities.ownerIdentityId} IS NULL`,
        ))

      for (const nhi of orphanedT0Nhis) {
        const t0Access = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(entitlements)
          .innerJoin(resources, eq(entitlements.resourceId, resources.id))
          .where(and(
            eq(entitlements.identityId, nhi.id),
            sql`(${resources.adTier} IN ('tier_0', 'tier_top') OR ${resources.criticality} = 'critical')`,
          ))

        if ((t0Access[0]?.count || 0) > 0) {
          const existing = await db
            .select({ id: policyViolations.id })
            .from(policyViolations)
            .where(and(
              eq(policyViolations.identityId, nhi.id),
              eq(policyViolations.violationType, 'orphaned_identity'),
              eq(policyViolations.status, 'open'),
              eq(policyViolations.orgId, orgId),
            ))
            .limit(1)

          if (existing.length === 0) {
            const [policy] = await db
              .select({ id: policies.id })
              .from(policies)
              .where(and(eq(policies.orgId, orgId), eq(policies.type, 'lifecycle_policy')))
              .limit(1)

            if (policy) {
              await db.insert(policyViolations).values({
                policyId: policy.id,
                identityId: nhi.id,
                violationType: 'orphaned_identity',
                severity: 'critical',
                status: 'open',
                orgId,
              })
              totalViolations++
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Supply chain risk scan complete. ${totalViolations} new violations created.`,
      violations: totalViolations,
    })
  } catch (error) {
    console.error('Supply chain risk cron error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

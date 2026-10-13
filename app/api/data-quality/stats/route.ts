import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities, identityAliases } from '@/lib/db/schema'
import { eq, and, isNull, isNotNull, sql, count } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { unauthorized, forbidden } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'viewer')) return forbidden()

    const orgId = session.user.orgId

    // Run all queries in parallel
    const [
      qualityScoreResult,
      completenessResult,
      fieldCoverageResult,
      aliasStatsResult,
      classificationStatsResult,
    ] = await Promise.all([
      // Average quality score
      db.select({
        avg: sql<number>`COALESCE(AVG((data_quality->>'score')::numeric), 0)`.as('avg'),
      })
        .from(identities)
        .where(eq(identities.orgId, orgId)),

      // Completeness distribution
      db.select({
        high: sql<number>`COUNT(*) FILTER (WHERE (data_quality->>'score')::numeric > 80)`.as('high'),
        medium: sql<number>`COUNT(*) FILTER (WHERE (data_quality->>'score')::numeric BETWEEN 50 AND 80)`.as('medium'),
        low: sql<number>`COUNT(*) FILTER (WHERE (data_quality->>'score')::numeric < 50 AND data_quality IS NOT NULL)`.as('low'),
        unscored: sql<number>`COUNT(*) FILTER (WHERE data_quality IS NULL)`.as('unscored'),
      })
        .from(identities)
        .where(eq(identities.orgId, orgId)),

      // Field coverage: percentage of non-null values for key fields
      db.select({
        total: count().as('total'),
        emailFilled: sql<number>`COUNT(*) FILTER (WHERE email IS NOT NULL)`.as('email_filled'),
        departmentFilled: sql<number>`COUNT(*) FILTER (WHERE department IS NOT NULL)`.as('department_filled'),
        managerFilled: sql<number>`COUNT(*) FILTER (WHERE manager_identity_id IS NOT NULL)`.as('manager_filled'),
        adTierFilled: sql<number>`COUNT(*) FILTER (WHERE ad_tier IS NOT NULL AND ad_tier != 'unclassified')`.as('ad_tier_filled'),
        ownerFilled: sql<number>`COUNT(*) FILTER (WHERE owner_identity_id IS NOT NULL)`.as('owner_filled'),
      })
        .from(identities)
        .where(eq(identities.orgId, orgId)),

      // Alias stats
      db.select({
        total: count().as('total'),
        confirmed: sql<number>`COUNT(*) FILTER (WHERE status = 'confirmed')`.as('confirmed'),
        pendingReview: sql<number>`COUNT(*) FILTER (WHERE status = 'pending_review')`.as('pending_review'),
        rejected: sql<number>`COUNT(*) FILTER (WHERE status = 'rejected')`.as('rejected'),
      })
        .from(identityAliases)
        .where(eq(identityAliases.orgId, orgId)),

      // Classification stats
      db.select({
        typed: sql<number>`COUNT(*) FILTER (WHERE type IS NOT NULL)`.as('typed'),
        tiered: sql<number>`COUNT(*) FILTER (WHERE ad_tier IS NOT NULL AND ad_tier != 'unclassified')`.as('tiered'),
        unclassified: sql<number>`COUNT(*) FILTER (WHERE ad_tier IS NULL OR ad_tier = 'unclassified')`.as('unclassified'),
      })
        .from(identities)
        .where(eq(identities.orgId, orgId)),
    ])

    const totalIdentities = Number(fieldCoverageResult[0]?.total || 0)
    const pct = (val: number) => totalIdentities > 0 ? Math.round((val / totalIdentities) * 100) : 0

    return NextResponse.json({
      avgQualityScore: Math.round(Number(qualityScoreResult[0]?.avg || 0)),
      completenessDistribution: {
        high: Number(completenessResult[0]?.high || 0),
        medium: Number(completenessResult[0]?.medium || 0),
        low: Number(completenessResult[0]?.low || 0),
        unscored: Number(completenessResult[0]?.unscored || 0),
      },
      fieldCoverage: {
        email: pct(Number(fieldCoverageResult[0]?.emailFilled || 0)),
        department: pct(Number(fieldCoverageResult[0]?.departmentFilled || 0)),
        manager: pct(Number(fieldCoverageResult[0]?.managerFilled || 0)),
        adTier: pct(Number(fieldCoverageResult[0]?.adTierFilled || 0)),
        ownerIdentityId: pct(Number(fieldCoverageResult[0]?.ownerFilled || 0)),
      },
      aliasStats: {
        total: Number(aliasStatsResult[0]?.total || 0),
        confirmed: Number(aliasStatsResult[0]?.confirmed || 0),
        pendingReview: Number(aliasStatsResult[0]?.pendingReview || 0),
        rejected: Number(aliasStatsResult[0]?.rejected || 0),
      },
      classificationStats: {
        typed: Number(classificationStatsResult[0]?.typed || 0),
        tiered: Number(classificationStatsResult[0]?.tiered || 0),
        unclassified: Number(classificationStatsResult[0]?.unclassified || 0),
      },
    })
  } catch (err: any) {
    console.error('[Data Quality] Stats error:', err)
    return NextResponse.json({ error: 'Failed to fetch stats', details: err.message }, { status: 500 })
  }
}

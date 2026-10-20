import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { identities, policyViolations, identityThreats, groups, entitlements } from '@/lib/db/schema'
import { eq, ilike, or, desc } from 'drizzle-orm'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/search?q=query
 *
 * Unified search across identities, violations, threats, groups, and entitlements.
 * Returns categorized results limited to 5 per category.
 */
export const GET = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const q = req.nextUrl.searchParams.get('q')
  if (!q || q.length < 2) {
    return NextResponse.json({ results: {} })
  }

  const pattern = `%${q}%`

  const [identityResults, violationResults, threatResults, groupResults, entitlementResults] = await Promise.all([
    db.select({
      id: identities.id,
      name: identities.displayName,
      type: identities.type,
      tier: identities.adTier,
      riskScore: identities.riskScore,
    })
      .from(identities)
      .where(or(
        ilike(identities.displayName, pattern),
        ilike(identities.upn, pattern),
        ilike(identities.email, pattern),
      ))
      .limit(5),

    db.select({
      id: policyViolations.id,
      type: policyViolations.violationType,
      severity: policyViolations.severity,
      status: policyViolations.status,
    })
      .from(policyViolations)
      .where(eq(policyViolations.orgId, orgId))
      .orderBy(desc(policyViolations.detectedAt))
      .limit(5),

    db.select({
      id: identityThreats.id,
      type: identityThreats.threatType,
      severity: identityThreats.severity,
      status: identityThreats.status,
    })
      .from(identityThreats)
      .where(eq(identityThreats.orgId, orgId))
      .orderBy(desc(identityThreats.lastSeenAt))
      .limit(5),

    db.select({
      id: groups.id,
      name: groups.name,
      type: groups.type,
      tier: groups.adTier,
    })
      .from(groups)
      .where(ilike(groups.name, pattern))
      .limit(5),

    db.select({
      id: entitlements.id,
      name: entitlements.permissionName,
      scope: entitlements.permissionScope,
      tier: entitlements.adTierOfPermission,
    })
      .from(entitlements)
      .where(ilike(entitlements.permissionName, pattern))
      .limit(5),
  ])

  log.info('Global search', { query: q, results: {
    identities: identityResults.length,
    violations: violationResults.length,
    threats: threatResults.length,
    groups: groupResults.length,
    entitlements: entitlementResults.length,
  }})

  return NextResponse.json({
    results: {
      identities: identityResults,
      violations: violationResults,
      threats: threatResults,
      groups: groupResults,
      entitlements: entitlementResults,
    },
  })
})

import { db } from '@/lib/db'
import { identities, policyViolations, accounts } from '@/lib/db/schema'
import { eq, and, desc, count, sql } from 'drizzle-orm'

export async function buildAIContext(orgId: string) {
  const [
    identityCounts,
    tierCounts,
    topRisky,
    violationsByType,
    orphanedNhis,
    mfaStats,
  ] = await Promise.all([
    db.select({ type: identities.type, count: count() })
      .from(identities).where(eq(identities.orgId, orgId))
      .groupBy(identities.type),

    db.select({ tier: identities.adTier, count: count() })
      .from(identities).where(eq(identities.orgId, orgId))
      .groupBy(identities.adTier),

    // Only top 5 with minimal fields to keep context small
    db.select({
      id: identities.id,
      name: identities.displayName,
      tier: identities.adTier,
      effectiveTier: identities.effectiveTier,
      tierViolation: identities.tierViolation,
      risk: identities.riskScore,
    })
      .from(identities)
      .where(eq(identities.orgId, orgId))
      .orderBy(desc(identities.riskScore))
      .limit(5),

    db.select({ type: policyViolations.violationType, count: count() })
      .from(policyViolations)
      .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open')))
      .groupBy(policyViolations.violationType),

    db.select({ count: count() })
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.type, 'non_human'),
        sql`${identities.ownerIdentityId} IS NULL`,
      )),

    db.select({
      total: count(),
      withMfa: sql<number>`COUNT(*) FILTER (WHERE ${accounts.mfaEnabled} = true)`,
    })
      .from(accounts)
      .where(eq(accounts.orgId, orgId)),
  ])

  // Build compact context string (not JSON dump)
  const human = identityCounts.find(r => r.type === 'human')?.count ?? 0
  const nhi = identityCounts.find(r => r.type === 'non_human')?.count ?? 0
  const tiers = Object.fromEntries(tierCounts.map(r => [r.tier, Number(r.count)]))
  const violations = Object.fromEntries(violationsByType.map(r => [r.type, Number(r.count)]))
  const orphaned = Number(orphanedNhis[0]?.count ?? 0)
  const mfaTotal = Number(mfaStats[0]?.total ?? 0)
  const mfaWith = Number(mfaStats[0]?.withMfa ?? 0)

  return {
    summary: {
      identityCounts: { human: Number(human), non_human: Number(nhi) },
      tierDistribution: tiers,
      orphanedNhiCount: orphaned,
      mfaCoverage: { total: mfaTotal, withMfa: mfaWith },
    },
    topRiskyIdentities: topRisky,
    openViolations: violations,
  }
}

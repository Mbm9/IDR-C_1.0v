import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities, entitlements, resources } from '@/lib/db/schema'
import { eq, and, count, desc, sql, countDistinct } from 'drizzle-orm'
import { CLASSIFIED_TIERS } from '@/lib/utils/tiers'

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId

  const [
    tierCounts,
    heatmapData,
    crossTierIdentities,
    tier0Identities,
    tier0Resources,
    topTierIdentities,
    topTierResources,
    unclassifiedIdentities,
    tierViolationCount,
  ] = await Promise.all([
    // Tier counts
    db
      .select({ tier: identities.adTier, count: count() })
      .from(identities)
      .where(eq(identities.orgId, orgId))
      .groupBy(identities.adTier),

    // Heatmap: identity tier x entitlement tier
    db
      .select({
        identityTier: identities.adTier,
        accessTier: entitlements.adTierOfPermission,
        identityCount: countDistinct(identities.id),
      })
      .from(identities)
      .innerJoin(entitlements, and(
        eq(entitlements.identityId, identities.id),
        eq(entitlements.orgId, orgId),
      ))
      .where(eq(identities.orgId, orgId))
      .groupBy(identities.adTier, entitlements.adTierOfPermission),

    // Cross-tier identities (tier violations)
    db
      .select({
        id: identities.id,
        displayName: identities.displayName,
        type: identities.type,
        adTier: identities.adTier,
        effectiveTier: identities.effectiveTier,
        riskScore: identities.riskScore,
        status: identities.status,
      })
      .from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.tierViolation, true)))
      .orderBy(desc(identities.riskScore))
      .limit(50),

    // Tier 0 identities
    db
      .select({
        id: identities.id,
        displayName: identities.displayName,
        type: identities.type,
        subType: identities.subType,
        status: identities.status,
        riskScore: identities.riskScore,
      })
      .from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.adTier, 'tier_0')))
      .orderBy(desc(identities.riskScore)),

    // Tier 0 resources
    db
      .select({
        id: resources.id,
        name: resources.name,
        type: resources.type,
        criticality: resources.criticality,
        environment: resources.environment,
      })
      .from(resources)
      .where(and(eq(resources.orgId, orgId), eq(resources.adTier, 'tier_0'))),

    // Top Tier identities (Tier 0 adjacent: ADFS, Entra Connect, PKI, PAM, DC backup)
    db
      .select({
        id: identities.id,
        displayName: identities.displayName,
        type: identities.type,
        subType: identities.subType,
        status: identities.status,
        riskScore: identities.riskScore,
      })
      .from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.adTier, 'tier_top')))
      .orderBy(desc(identities.riskScore)),

    // Top Tier resources
    db
      .select({
        id: resources.id,
        name: resources.name,
        type: resources.type,
        criticality: resources.criticality,
        environment: resources.environment,
      })
      .from(resources)
      .where(and(eq(resources.orgId, orgId), eq(resources.adTier, 'tier_top'))),

    // Unclassified identities
    db
      .select({
        id: identities.id,
        displayName: identities.displayName,
        type: identities.type,
        subType: identities.subType,
        sourceSystem: identities.sourceSystem,
      })
      .from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.adTier, 'unclassified')))
      .limit(25),

    // Total tier violations (the cross-tier list above is capped)
    db
      .select({ count: count() })
      .from(identities)
      .where(and(eq(identities.orgId, orgId), eq(identities.tierViolation, true))),
  ])

  // Build heatmap matrix
  const tiers = CLASSIFIED_TIERS
  const heatmap: Record<string, Record<string, number>> = {}
  for (const row of tiers) {
    heatmap[row] = {}
    for (const col of tiers) {
      heatmap[row][col] = 0
    }
  }
  for (const entry of heatmapData) {
    const iT = entry.identityTier
    const aT = entry.accessTier
    if (iT && aT && iT in heatmap && aT in heatmap[iT]) {
      heatmap[iT][aT] = Number(entry.identityCount)
    }
  }

  const total = tierCounts.reduce((sum, t) => sum + Number(t.count), 0)

  return NextResponse.json({
    tierCounts: Object.fromEntries(tierCounts.map(t => [t.tier, Number(t.count)])),
    totalIdentities: total,
    heatmap,
    crossTierIdentities,
    tierViolationCount: Number(tierViolationCount[0]?.count ?? 0),
    tier0Identities,
    tier0Resources,
    topTierIdentities,
    topTierResources,
    unclassifiedIdentities,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identities, entitlements } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'

// Numeric tier ordering: tier_0 = 0 (highest privilege), tier_1 = 1, tier_2 = 2, unclassified = 3
const TIER_ORDER: Record<string, number> = {
  tier_0: 0,
  tier_1: 1,
  tier_2: 2,
  unclassified: 3,
}

function higherTier(a: string, b: string): string {
  return (TIER_ORDER[a] ?? 3) <= (TIER_ORDER[b] ?? 3) ? a : b
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all identities
    const allIdentities = await db
      .select({
        id: identities.id,
        adTier: identities.adTier,
      })
      .from(identities)

    let updatedCount = 0
    let violationCount = 0

    for (const identity of allIdentities) {
      // Find the highest tier among this identity's entitlements
      const tierResults = await db
        .select({ tier: entitlements.adTierOfPermission })
        .from(entitlements)
        .where(eq(entitlements.identityId, identity.id))

      if (tierResults.length === 0) {
        // No entitlements: effective tier is unclassified, no violation
        if (identity.adTier !== 'unclassified') {
          // Only update if something changed - effectiveTier becomes null/unclassified
          await db
            .update(identities)
            .set({
              effectiveTier: 'unclassified',
              tierViolation: false,
              updatedAt: new Date(),
            })
            .where(eq(identities.id, identity.id))
          updatedCount++
        }
        continue
      }

      // Find highest tier (lowest number = highest privilege)
      let effectiveTier = 'unclassified'
      for (const row of tierResults) {
        effectiveTier = higherTier(effectiveTier, row.tier)
      }

      // Violation: effective tier is higher privilege than assigned ad tier
      // i.e., effectiveTier number < adTier number
      const adTierRank = TIER_ORDER[identity.adTier] ?? 3
      const effectiveTierRank = TIER_ORDER[effectiveTier] ?? 3
      const hasViolation = effectiveTierRank < adTierRank

      await db
        .update(identities)
        .set({
          effectiveTier: effectiveTier as 'tier_0' | 'tier_1' | 'tier_2' | 'unclassified',
          tierViolation: hasViolation,
          updatedAt: new Date(),
        })
        .where(eq(identities.id, identity.id))

      updatedCount++
      if (hasViolation) violationCount++
    }

    return NextResponse.json({
      success: true,
      message: `Scanned ${updatedCount} identities, found ${violationCount} tier violations`,
      count: violationCount,
    })
  } catch (error) {
    console.error('Tier scanner cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Tier scanner failed', error: String(error) },
      { status: 500 }
    )
  }
}

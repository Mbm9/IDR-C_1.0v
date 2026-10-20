import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identities, entitlements } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'
import { isStricterTier, stricterTier, type AdTier } from '@/lib/utils/tiers'

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

      // Find the most privileged tier this identity reaches
      let effectiveTier: AdTier = 'unclassified'
      for (const row of tierResults) {
        effectiveTier = stricterTier(effectiveTier, row.tier)
      }

      // Violation: effective tier is more privileged than the assigned ad tier
      const hasViolation = isStricterTier(effectiveTier, identity.adTier)

      await db
        .update(identities)
        .set({
          effectiveTier,
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

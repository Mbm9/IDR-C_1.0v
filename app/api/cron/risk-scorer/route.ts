import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identities, organizations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { recalculateRiskForIdentity } from '@/lib/risk/scorer'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalUpdated = 0

    for (const org of allOrgs) {
      const orgIdentities = await db
        .select({ id: identities.id })
        .from(identities)
        .where(eq(identities.orgId, org.id))

      for (const identity of orgIdentities) {
        // Persists the score, factors, the per-day score history and the
        // derived riskVelocity (see lib/risk/scorer.ts).
        await recalculateRiskForIdentity(identity.id, org.id)
        totalUpdated++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recalculated risk scores for ${totalUpdated} identities`,
      count: totalUpdated,
    })
  } catch (error) {
    console.error('Risk scorer cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Risk scorer failed', error: String(error) },
      { status: 500 }
    )
  }
}

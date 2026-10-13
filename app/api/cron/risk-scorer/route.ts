import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identities, organizations, actionLog } from '@/lib/db/schema'
import { eq, and, gte, desc, sql } from 'drizzle-orm'
import { recalculateRiskForIdentity, calculateRiskVelocity } from '@/lib/risk/scorer'
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
        const result = await recalculateRiskForIdentity(identity.id, org.id)
        if (result) {
          // Compute velocity: query for risk score from 30 days ago via action_log
          const thirtyDaysAgo = new Date()
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

          const [prevEntry] = await db.select({ payload: actionLog.payload })
            .from(actionLog)
            .where(and(
              eq(actionLog.orgId, org.id),
              eq(actionLog.targetIdentityId, identity.id),
              eq(actionLog.actionType, 'assess_identity'),
              gte(actionLog.createdAt, thirtyDaysAgo),
            ))
            .orderBy(actionLog.createdAt)
            .limit(1)

          const prevScore = (prevEntry?.payload as any)?.riskScore ?? result.score
          const velocity = calculateRiskVelocity(result.score, prevScore)

          // Store velocity in riskFactors
          const updatedFactors = { ...result.factors, riskVelocity: velocity }
          await db.update(identities)
            .set({ riskFactors: updatedFactors })
            .where(eq(identities.id, identity.id))
        }
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

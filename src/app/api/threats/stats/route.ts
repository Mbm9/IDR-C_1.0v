import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identityThreats } from '@/lib/db/schema'
import { eq, and, gte, sql, count, avg } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const activeCondition = and(
      eq(identityThreats.orgId, orgId),
      eq(identityThreats.status, 'active'),
    )

    const [
      totalActive,
      bySeverity,
      byKillChain,
      byThreatType,
      avgConfidence,
      threatsToday,
      threatsWeek,
      threatsMonth,
    ] = await Promise.all([
      // Total active threats
      db.select({ total: count() }).from(identityThreats).where(activeCondition),

      // By severity (active only)
      db.select({
        severity: identityThreats.severity,
        count: count(),
      }).from(identityThreats).where(activeCondition).groupBy(identityThreats.severity),

      // By kill chain phase (active only)
      db.select({
        phase: identityThreats.killChainPhase,
        count: count(),
      }).from(identityThreats).where(activeCondition).groupBy(identityThreats.killChainPhase),

      // By threat type (active only)
      db.select({
        type: identityThreats.threatType,
        count: count(),
      }).from(identityThreats).where(activeCondition).groupBy(identityThreats.threatType),

      // Average confidence
      db.select({
        avg: avg(identityThreats.confidence),
      }).from(identityThreats).where(activeCondition),

      // Threats today
      db.select({ total: count() }).from(identityThreats).where(and(
        eq(identityThreats.orgId, orgId),
        gte(identityThreats.createdAt, todayStart),
      )),

      // Threats this week
      db.select({ total: count() }).from(identityThreats).where(and(
        eq(identityThreats.orgId, orgId),
        gte(identityThreats.createdAt, weekAgo),
      )),

      // Threats this month
      db.select({ total: count() }).from(identityThreats).where(and(
        eq(identityThreats.orgId, orgId),
        gte(identityThreats.createdAt, monthAgo),
      )),
    ])

    return NextResponse.json({
      totalActive: Number(totalActive[0]?.total || 0),
      bySeverity: Object.fromEntries(bySeverity.map(r => [r.severity, Number(r.count)])),
      byKillChainPhase: Object.fromEntries(byKillChain.map(r => [r.phase, Number(r.count)])),
      byThreatType: Object.fromEntries(byThreatType.map(r => [r.type, Number(r.count)])),
      avgConfidence: Math.round(Number(avgConfidence[0]?.avg || 0)),
      threatsToday: Number(threatsToday[0]?.total || 0),
      threatsWeek: Number(threatsWeek[0]?.total || 0),
      threatsMonth: Number(threatsMonth[0]?.total || 0),
    })
  } catch (err: any) {
    console.error('[Threats Stats] Error:', err)
    return NextResponse.json({ error: 'Failed to load threat stats', details: err.message }, { status: 500 })
  }
}

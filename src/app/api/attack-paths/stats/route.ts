import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { attackPaths } from '@/lib/db/schema'
import { eq, and, gte, sql } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId

    const [stats] = await db
      .select({
        totalPaths: sql<number>`count(*)::int`,
        criticalCount: sql<number>`count(*) filter (where ${attackPaths.riskScore} >= 80)::int`,
        highCount: sql<number>`count(*) filter (where ${attackPaths.riskScore} >= 60 and ${attackPaths.riskScore} < 80)::int`,
        avgLength: sql<number>`coalesce(round(avg(${attackPaths.pathLength}), 1), 0)`,
        shortestPath: sql<number>`coalesce(min(${attackPaths.pathLength}), 0)`,
        maxRiskScore: sql<number>`coalesce(max(${attackPaths.riskScore}), 0)`,
        uniqueSources: sql<number>`count(distinct ${attackPaths.sourceIdentityId})::int`,
      })
      .from(attackPaths)
      .where(eq(attackPaths.orgId, orgId))

    // Shortest path to Domain Admin specifically
    const [shortestToDA] = await db
      .select({
        shortest: sql<number>`coalesce(min(${attackPaths.pathLength}), 0)`,
      })
      .from(attackPaths)
      .where(
        and(
          eq(attackPaths.orgId, orgId),
          sql`${attackPaths.attackTechnique} ilike '%domain admin%' OR ${attackPaths.attackTechnique} ilike '%privilege escalation%'`
        )
      )

    return NextResponse.json({
      totalPaths: stats.totalPaths,
      criticalCount: stats.criticalCount,
      highCount: stats.highCount,
      avgLength: Number(stats.avgLength),
      shortestPath: stats.shortestPath,
      shortestToDA: shortestToDA?.shortest || stats.shortestPath,
      maxRiskScore: stats.maxRiskScore,
      identitiesWithT0Paths: stats.uniqueSources,
    })
  } catch (error) {
    console.error('[AttackPaths] Stats error:', error)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { postureSnapshots } from '@/lib/db/schema'
import { eq, and, gte, asc } from 'drizzle-orm'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/exposures/trends?days=30
 *
 * Trend Insights: exposure score + counts over time from posture_snapshots.
 */
export const GET = withApiHandler(async (req: NextRequest, { orgId }) => {
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days') || '30')))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      capturedAt: postureSnapshots.capturedAt,
      exposureScore: postureSnapshots.exposureScore,
      totalOpen: postureSnapshots.totalOpen,
      bySeverity: postureSnapshots.bySeverity,
      byCategory: postureSnapshots.byCategory,
      byImpact: postureSnapshots.byImpact,
    })
    .from(postureSnapshots)
    .where(and(eq(postureSnapshots.orgId, orgId), gte(postureSnapshots.capturedAt, since)))
    .orderBy(asc(postureSnapshots.capturedAt))

  return NextResponse.json({
    points: rows.map((r) => ({
      capturedAt: r.capturedAt.toISOString(),
      exposureScore: r.exposureScore,
      totalOpen: r.totalOpen,
      bySeverity: r.bySeverity,
      byCategory: r.byCategory,
      byImpact: r.byImpact,
    })),
  })
})

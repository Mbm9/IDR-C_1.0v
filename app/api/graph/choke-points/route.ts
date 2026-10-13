import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { computeChokePoints } from '@/lib/graph/analysis'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/** GET /api/graph/choke-points — ranked "fix these N edges to break M% of Tier 0 attack paths". */
export const GET = withApiHandler(async (_req: NextRequest, { orgId, log }) => {
  const result = await computeChokePoints(orgId)
  log.info('Choke-point analysis', { totalPaths: result.totalPaths, fixes: result.fixes.length })
  return NextResponse.json(result)
}, { requiredRole: 'analyst' })

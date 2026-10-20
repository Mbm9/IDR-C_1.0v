import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { GRAPH_QUERIES } from '@/lib/graph/queries'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/** GET /api/graph/queries — the built-in graph query catalog. */
export const GET = withApiHandler(async (_req: NextRequest, {}) => {
  return NextResponse.json({ queries: GRAPH_QUERIES })
})

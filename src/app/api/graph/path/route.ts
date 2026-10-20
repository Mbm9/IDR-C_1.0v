import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { findPath } from '@/lib/graph/queries'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/** GET /api/graph/path?source=&target=&maxDepth= — PathFinder shortest path between two entities. */
export const GET = withApiHandler(async (req: NextRequest, { orgId }) => {
  const source = req.nextUrl.searchParams.get('source')
  const target = req.nextUrl.searchParams.get('target')
  const maxDepth = Math.min(12, Math.max(1, Number(req.nextUrl.searchParams.get('maxDepth') || '8')))
  if (!source || !target) return NextResponse.json({ error: 'source and target required' }, { status: 400 })
  const result = await findPath(orgId, source, target, maxDepth)
  return NextResponse.json(result)
})

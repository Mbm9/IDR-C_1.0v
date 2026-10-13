import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { runGraphQuery } from '@/lib/graph/queries'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/** GET /api/graph/query?id=... — run a built-in graph query, returns a focused subgraph. */
export const GET = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing query id' }, { status: 400 })
  const result = await runGraphQuery(orgId, id)
  log.info('Graph query run', { id, nodes: result.nodes.length, links: result.links.length })
  return NextResponse.json(result)
})

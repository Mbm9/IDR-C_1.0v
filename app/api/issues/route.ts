import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { getIssues } from '@/lib/issues/aggregate'
import { issueLocaleFromRequest } from '@/lib/issues/localize'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/issues — managed issue list (one per finding type) with status + exposure points.
 * Issue names follow the reader's locale (`?locale=` or the `locale` cookie).
 */
export const GET = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const issues = await getIssues(orgId, issueLocaleFromRequest(req))
  log.info('Issues listed', { count: issues.length })
  return NextResponse.json({ issues, assessedAt: new Date().toISOString() })
})

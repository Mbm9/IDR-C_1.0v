import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { identities, groups, resources } from '@/lib/db/schema'
import { eq, and, ilike } from 'drizzle-orm'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/** GET /api/graph/search?q= — node autocomplete for the PathFinder source/target pickers. */
export const GET = withApiHandler(async (req: NextRequest, { orgId }) => {
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })
  const like = `%${q}%`

  const [ids, grps, res] = await Promise.all([
    db.select({ id: identities.id, label: identities.displayName, tier: identities.adTier })
      .from(identities).where(and(eq(identities.orgId, orgId), ilike(identities.displayName, like))).limit(8),
    db.select({ id: groups.id, label: groups.name, tier: groups.adTier })
      .from(groups).where(and(eq(groups.orgId, orgId), ilike(groups.name, like))).limit(6),
    db.select({ id: resources.id, label: resources.name })
      .from(resources).where(and(eq(resources.orgId, orgId), ilike(resources.name, like))).limit(6),
  ])

  const results = [
    ...ids.map((r) => ({ id: r.id, label: r.label, type: 'identity', tier: r.tier })),
    ...grps.map((r) => ({ id: r.id, label: r.label, type: 'group', tier: r.tier })),
    ...res.map((r) => ({ id: r.id, label: r.label, type: 'resource', tier: undefined as string | undefined })),
  ]
  return NextResponse.json({ results })
})

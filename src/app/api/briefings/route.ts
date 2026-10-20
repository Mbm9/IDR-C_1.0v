import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { briefings } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { localizeBriefing, normalizeLocale } from '@/lib/ai/briefing'

/**
 * Briefings are stored with message keys (deterministic) or English text plus
 * translations (AI). `narrative` and `highlights` are returned rendered in the
 * viewer's locale (`?locale=` or the `locale` cookie the UI sets), so the
 * dashboard can show them as-is. Rows stored before keyed storage fall back to
 * their stored text. `generatedBy`/`model` say whether a model wrote the text.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const locale = normalizeLocale(req.nextUrl.searchParams.get('locale') ?? req.cookies.get('locale')?.value)
  const latest = req.nextUrl.searchParams.get('latest')
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1') || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '10') || 10))

  if (latest === 'true') {
    const [latestBriefing] = await db.select()
      .from(briefings)
      .where(eq(briefings.orgId, orgId))
      .orderBy(desc(briefings.generatedAt))
      .limit(1)

    return NextResponse.json(latestBriefing ? localizeBriefing(latestBriefing, locale) : null)
  }

  const offset = (page - 1) * pageSize
  const data = await db.select()
    .from(briefings)
    .where(eq(briefings.orgId, orgId))
    .orderBy(desc(briefings.generatedAt))
    .limit(pageSize)
    .offset(offset)

  return NextResponse.json({ data: data.map((row) => localizeBriefing(row, locale)), page, pageSize })
}

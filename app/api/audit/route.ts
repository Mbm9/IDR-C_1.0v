import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { actionLog, identities, users } from '@/lib/db/schema'
import { eq, and, desc, count, sql, SQL } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orgId = session.user.orgId

  const params = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(params.get('page') || '1'))
  const pageSize = Math.min(100, parseInt(params.get('pageSize') || '25'))
  const filterAction = params.get('actionType') || undefined
  const filterSource = params.get('source') || undefined

  const conditions: SQL[] = [eq(actionLog.orgId, orgId)]
  if (filterAction) conditions.push(eq(actionLog.actionType, filterAction as any))
  if (filterSource) conditions.push(eq(actionLog.source, filterSource as any))

  const where = and(...conditions)
  const offset = (page - 1) * pageSize

  const [entries, totalResult] = await Promise.all([
    db.select({
      id: actionLog.id,
      actionType: actionLog.actionType,
      rationale: actionLog.rationale,
      source: actionLog.source,
      payload: actionLog.payload,
      createdAt: actionLog.createdAt,
      // Actions taken in the app record the signed-in user's id; seeded and
      // connector-driven actions record an identity id. Resolve either.
      actorName: sql<string | null>`coalesce(${identities.displayName}, ${users.name}, ${users.email})`,
    })
      .from(actionLog)
      .leftJoin(identities, eq(actionLog.actorIdentityId, identities.id))
      .leftJoin(users, eq(actionLog.actorIdentityId, users.id))
      .where(where)
      .orderBy(desc(actionLog.createdAt))
      .limit(pageSize)
      .offset(offset),

    db.select({ total: count() }).from(actionLog).where(where),
  ])

  return NextResponse.json({
    data: entries,
    total: totalResult[0]?.total ?? 0,
    page,
    pageSize,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { identities } from '@/lib/db/schema'
import { and, eq, gte, lte, ilike, or, desc, asc, count, sql, SQL } from 'drizzle-orm'
import { identityFilterSchema } from '@/lib/schemas/identity'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

export const GET = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const params = Object.fromEntries(req.nextUrl.searchParams)

  const parsed = identityFilterSchema.safeParse(params)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, { status: 400 })
  }

  const filters = parsed.data
  const conditions: SQL[] = [eq(identities.orgId, orgId)]

  if (filters.type) conditions.push(eq(identities.type, filters.type))
  if (filters.subType) conditions.push(eq(identities.subType, filters.subType))
  if (filters.adTier) conditions.push(eq(identities.adTier, filters.adTier))
  if (filters.status) conditions.push(eq(identities.status, filters.status))
  if (filters.sourceSystem) conditions.push(eq(identities.sourceSystem, filters.sourceSystem))
  if (filters.riskScoreMin !== undefined) conditions.push(gte(identities.riskScore, filters.riskScoreMin))
  if (filters.riskScoreMax !== undefined) conditions.push(lte(identities.riskScore, filters.riskScoreMax))
  if (filters.tierViolation !== undefined) conditions.push(eq(identities.tierViolation, filters.tierViolation))

  if (filters.search) {
    const search = `%${filters.search}%`
    conditions.push(
      or(
        ilike(identities.displayName, search),
        ilike(identities.upn, search),
        ilike(identities.email, search),
        ilike(identities.samAccountName, search),
      )!
    )
  }

  // Velocity filter: 'deteriorating' (velocity > 0), 'improving' (velocity < 0), 'stable'
  const velocityFilter = params.velocityDirection
  if (velocityFilter === 'deteriorating') {
    conditions.push(sql`(${identities.riskFactors}->>'riskVelocity')::float > 0`)
  } else if (velocityFilter === 'improving') {
    conditions.push(sql`(${identities.riskFactors}->>'riskVelocity')::float < 0`)
  } else if (velocityFilter === 'stable') {
    conditions.push(sql`abs((${identities.riskFactors}->>'riskVelocity')::float) <= 0.5`)
  }

  const where = and(...conditions)

  // Sort — support velocity sorting via JSONB
  let orderExpr
  if (filters.sortBy === 'velocity') {
    orderExpr = filters.sortOrder === 'asc'
      ? asc(sql`(${identities.riskFactors}->>'riskVelocity')::float`)
      : desc(sql`(${identities.riskFactors}->>'riskVelocity')::float`)
  } else {
    const sortColumn = filters.sortBy && filters.sortBy in identities
      ? (identities as any)[filters.sortBy]
      : identities.riskScore
    const orderFn = filters.sortOrder === 'asc' ? asc : desc
    orderExpr = orderFn(sortColumn)
  }

  const offset = (filters.page - 1) * filters.pageSize

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(identities)
      .where(where)
      .orderBy(orderExpr)
      .limit(filters.pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(identities)
      .where(where),
  ])

  log.info('Identities queried', { total: totalResult[0]?.total ?? 0, page: filters.page })

  return NextResponse.json({
    data,
    total: totalResult[0]?.total ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  })
})

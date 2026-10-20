import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { policyViolations, policies, identities } from '@/lib/db/schema'
import { and, eq, count, desc, asc, sql, gt, SQL } from 'drizzle-orm'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

export const GET = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const params = req.nextUrl.searchParams

  const page = Math.max(1, parseInt(params.get('page') || '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') || '25')))
  const filterType = params.get('violationType') || undefined
  const filterSeverity = params.get('severity') || undefined
  const filterStatus = params.get('status') || undefined
  const sortOrder = params.get('sortOrder') === 'asc' ? asc : desc

  // Build where conditions
  const conditions: SQL[] = [eq(policyViolations.orgId, orgId)]
  if (filterType) conditions.push(eq(policyViolations.violationType, filterType as any))
  if (filterSeverity) conditions.push(eq(policyViolations.severity, filterSeverity as any))
  if (filterStatus) conditions.push(eq(policyViolations.status, filterStatus as any))

  const where = and(...conditions)
  const offset = (page - 1) * pageSize

  const [
    violationList,
    totalResult,
    severityCounts,
    typeCounts,
    statusCounts,
    exceptions,
    remediationStats,
  ] = await Promise.all([
    db
      .select({
        id: policyViolations.id,
        violationType: policyViolations.violationType,
        severity: policyViolations.severity,
        status: policyViolations.status,
        detectedAt: policyViolations.detectedAt,
        remediatedAt: policyViolations.remediatedAt,
        exceptionReason: policyViolations.exceptionReason,
        exceptionExpiresAt: policyViolations.exceptionExpiresAt,
        policyName: policies.name,
        identityId: identities.id,
        identityName: identities.displayName,
        identityType: identities.type,
      })
      .from(policyViolations)
      .leftJoin(policies, eq(policyViolations.policyId, policies.id))
      .leftJoin(identities, eq(policyViolations.identityId, identities.id))
      .where(where)
      .orderBy(sortOrder(policyViolations.detectedAt))
      .limit(pageSize)
      .offset(offset),

    db.select({ total: count() }).from(policyViolations).where(where),

    db
      .select({ severity: policyViolations.severity, count: count() })
      .from(policyViolations)
      .where(eq(policyViolations.orgId, orgId))
      .groupBy(policyViolations.severity),

    db
      .select({ type: policyViolations.violationType, count: count() })
      .from(policyViolations)
      .where(eq(policyViolations.orgId, orgId))
      .groupBy(policyViolations.violationType),

    db
      .select({ status: policyViolations.status, count: count() })
      .from(policyViolations)
      .where(eq(policyViolations.orgId, orgId))
      .groupBy(policyViolations.status),

    db
      .select({
        id: policyViolations.id,
        violationType: policyViolations.violationType,
        severity: policyViolations.severity,
        exceptionReason: policyViolations.exceptionReason,
        exceptionExpiresAt: policyViolations.exceptionExpiresAt,
        identityName: identities.displayName,
        identityId: identities.id,
      })
      .from(policyViolations)
      .leftJoin(identities, eq(policyViolations.identityId, identities.id))
      .where(and(
        eq(policyViolations.orgId, orgId),
        eq(policyViolations.status, 'excepted'),
        gt(policyViolations.exceptionExpiresAt, new Date()),
      ))
      .orderBy(asc(policyViolations.exceptionExpiresAt)),

    db
      .select({
        total: count(),
        remediated: sql<number>`COUNT(*) FILTER (WHERE ${policyViolations.status} = 'remediated')`,
      })
      .from(policyViolations)
      .where(and(
        eq(policyViolations.orgId, orgId),
        gt(policyViolations.detectedAt, sql`NOW() - INTERVAL '90 days'`),
      )),
  ])

  const remTotal = Number(remediationStats[0]?.total ?? 0)
  const remDone = Number(remediationStats[0]?.remediated ?? 0)
  const remediationRate = remTotal > 0 ? Math.round((remDone / remTotal) * 100) : 100

  log.info('Violations queried', { total: totalResult[0]?.total ?? 0, page })

  return NextResponse.json({
    data: violationList,
    total: totalResult[0]?.total ?? 0,
    page,
    pageSize,
    summary: {
      bySeverity: Object.fromEntries(severityCounts.map(s => [s.severity, Number(s.count)])),
      byType: Object.fromEntries(typeCounts.map(t => [t.type, Number(t.count)])),
      byStatus: Object.fromEntries(statusCounts.map(s => [s.status, Number(s.count)])),
      remediationRate,
    },
    exceptions,
  })
})

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identityThreats, identities } from '@/lib/db/schema'
import { eq, and, desc, gte, lte, sql, count } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, parseJsonBody } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'
import { threatTypeEnum, killChainPhaseEnum, severityEnum } from '@/lib/db/schema/enums'
import { z } from 'zod'

const createThreatSchema = z.object({
  threatType: z.enum(threatTypeEnum.enumValues),
  severity: z.enum(severityEnum.enumValues),
  identityId: z.string().uuid(),
  killChainPhase: z.enum(killChainPhaseEnum.enumValues),
  evidence: z.record(z.string(), z.unknown()).optional(),
  sourceIp: z.string().max(100).optional(),
  sourceLocation: z.string().max(200).optional(),
  targetResource: z.string().max(500).optional(),
  mitreTechniqueIds: z.array(z.string().max(50)).max(50).optional(),
  mitreTechniqueName: z.string().max(200).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId
    const { searchParams } = new URL(req.url)

    const threatType = searchParams.get('threatType')
    const severity = searchParams.get('severity')
    const status = searchParams.get('status')
    const identityId = searchParams.get('identityId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
    const offset = (page - 1) * limit

    const conditions = [eq(identityThreats.orgId, orgId)]

    if (threatType) conditions.push(eq(identityThreats.threatType, threatType as any))
    if (severity) conditions.push(eq(identityThreats.severity, severity as any))
    if (status) conditions.push(eq(identityThreats.status, status as any))
    if (identityId) conditions.push(eq(identityThreats.identityId, identityId))
    if (dateFrom) conditions.push(gte(identityThreats.firstSeenAt, new Date(dateFrom)))
    if (dateTo) conditions.push(lte(identityThreats.lastSeenAt, new Date(dateTo)))

    const whereClause = and(...conditions)

    const [threats, [{ total }]] = await Promise.all([
      db
        .select({
          id: identityThreats.id,
          threatType: identityThreats.threatType,
          severity: identityThreats.severity,
          status: identityThreats.status,
          identityId: identityThreats.identityId,
          identityName: identities.displayName,
          identityTier: identities.adTier,
          killChainPhase: identityThreats.killChainPhase,
          confidence: identityThreats.confidence,
          mitreTechniqueIds: identityThreats.mitreTechniqueIds,
          mitreTechniqueName: identityThreats.mitreTechniqueName,
          sourceIp: identityThreats.sourceIp,
          sourceLocation: identityThreats.sourceLocation,
          targetResource: identityThreats.targetResource,
          firstSeenAt: identityThreats.firstSeenAt,
          lastSeenAt: identityThreats.lastSeenAt,
          createdAt: identityThreats.createdAt,
        })
        .from(identityThreats)
        .leftJoin(identities, eq(identityThreats.identityId, identities.id))
        .where(whereClause)
        .orderBy(desc(identityThreats.lastSeenAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(identityThreats)
        .where(whereClause),
    ])

    return NextResponse.json({
      threats,
      pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
    })
  } catch (err: any) {
    console.error('[Threats GET] Error:', err)
    return NextResponse.json({ error: 'Failed to load threats', details: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

    const orgId = session.user.orgId
    const parsed = await parseJsonBody(req, createThreatSchema)
    if (!parsed.ok) return parsed.response

    const {
      threatType, severity, identityId, killChainPhase,
      evidence, sourceIp, sourceLocation, targetResource,
      mitreTechniqueIds, mitreTechniqueName, confidence,
    } = parsed.data

    // The reported identity must belong to the caller's org.
    const [target] = await db
      .select({ id: identities.id })
      .from(identities)
      .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))
      .limit(1)
    if (!target) {
      return NextResponse.json({ error: 'Identity not found' }, { status: 404 })
    }

    const now = new Date()
    const [threat] = await db.insert(identityThreats).values({
      threatType,
      severity,
      status: 'active',
      identityId,
      killChainPhase,
      evidence: evidence || {},
      sourceIp,
      sourceLocation,
      targetResource,
      mitreTechniqueIds: mitreTechniqueIds || [],
      mitreTechniqueName,
      confidence: confidence ?? 50,
      firstSeenAt: now,
      lastSeenAt: now,
      orgId,
    }).returning()

    await logAction({
      actionType: 'escalate_risk',
      actorIdentityId: session.user.id,
      orgId,
      targetIdentityId: identityId,
      rationale: `Manual threat report: ${threatType}`,
      payload: { operation: 'report_threat', threatId: threat.id, threatType, severity, killChainPhase },
      source: 'manual',
    })

    return NextResponse.json(threat, { status: 201 })
  } catch (err: any) {
    console.error('[Threats POST] Error:', err)
    return NextResponse.json({ error: 'Failed to create threat', details: err.message }, { status: 500 })
  }
}

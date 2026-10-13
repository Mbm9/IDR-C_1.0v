import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identityAliases, identities } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { resolveIdentities } from '@/lib/data-quality/resolver'
import { unauthorized, forbidden, logAction, parseJsonBody } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'
import { z } from 'zod'

const reviewAliasSchema = z.object({
  aliasId: z.string().uuid(),
  status: z.enum(['confirmed', 'rejected']),
  rationale: z.string().max(2000).optional(),
})

const resolveRunSchema = z.object({
  skipAI: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

    const orgId = session.user.orgId

    // Return pending alias review queue joined with identity display names
    const pendingAliases = await db
      .select({
        id: identityAliases.id,
        canonicalIdentityId: identityAliases.canonicalIdentityId,
        sourceSystem: identityAliases.sourceSystem,
        sourceId: identityAliases.sourceId,
        sourceDisplayName: identityAliases.sourceDisplayName,
        sourceEmail: identityAliases.sourceEmail,
        sourceUpn: identityAliases.sourceUpn,
        matchConfidence: identityAliases.matchConfidence,
        matchMethod: identityAliases.matchMethod,
        matchedFields: identityAliases.matchedFields,
        status: identityAliases.status,
        createdAt: identityAliases.createdAt,
        canonicalDisplayName: identities.displayName,
        canonicalEmail: identities.email,
        canonicalUpn: identities.upn,
        canonicalSourceSystem: identities.sourceSystem,
      })
      .from(identityAliases)
      .innerJoin(identities, eq(identityAliases.canonicalIdentityId, identities.id))
      .where(and(
        eq(identityAliases.orgId, orgId),
        eq(identityAliases.status, 'pending_review'),
      ))
      .orderBy(identityAliases.createdAt)

    return NextResponse.json({ aliases: pendingAliases })
  } catch (err: any) {
    console.error('[Data Quality] Resolve GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch aliases', details: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

    const orgId = session.user.orgId
    const parsed = await parseJsonBody(req, reviewAliasSchema)
    if (!parsed.ok) return parsed.response
    const { aliasId, status, rationale } = parsed.data

    // Verify alias belongs to this org
    const [alias] = await db
      .select()
      .from(identityAliases)
      .where(and(eq(identityAliases.id, aliasId), eq(identityAliases.orgId, orgId)))
      .limit(1)

    if (!alias) {
      return NextResponse.json({ error: 'Alias not found' }, { status: 404 })
    }

    await db
      .update(identityAliases)
      .set({
        status,
        reviewedBy: (session.user as any).identityId || null,
        reviewedAt: new Date(),
      })
      .where(eq(identityAliases.id, aliasId))

    await logAction({
      actionType: 'data_quality_action',
      actorIdentityId: session.user.id,
      orgId,
      targetIdentityId: alias.canonicalIdentityId,
      rationale: rationale ?? null,
      payload: {
        operation: 'review_alias',
        aliasId,
        sourceSystem: alias.sourceSystem,
        sourceId: alias.sourceId,
        previousStatus: alias.status,
        newStatus: status,
      },
    })

    return NextResponse.json({ success: true, aliasId, status })
  } catch (err: any) {
    console.error('[Data Quality] Resolve PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update alias', details: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

    const orgId = session.user.orgId
    const parsed = await parseJsonBody(req, resolveRunSchema)
    if (!parsed.ok) return parsed.response
    const { skipAI } = parsed.data

    const report = await resolveIdentities(orgId, { skipAI: !!skipAI })

    await logAction({
      actionType: 'data_quality_action',
      actorIdentityId: session.user.id,
      orgId,
      payload: {
        operation: 'resolve',
        skipAI: !!skipAI,
        totalPairs: report.totalPairs,
        deterministicMatches: report.deterministicMatches,
        fuzzyMatches: report.fuzzyMatches,
        aiMatches: report.aiMatches,
        pendingReview: report.pendingReview,
      },
    })

    return NextResponse.json(report)
  } catch (err: any) {
    console.error('[Data Quality] Resolve POST error:', err)
    return NextResponse.json({ error: 'Resolution failed', details: err.message }, { status: 500 })
  }
}

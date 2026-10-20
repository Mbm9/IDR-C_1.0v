import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { detectionRules } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { hasRole } from '@/lib/utils/rbac'
import { unauthorized, forbidden, logAction, parseJsonBody, changedKeys } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

const detectionRuleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  threatType: z.string().trim().min(1).max(100).optional(),
  killChainPhase: z.string().trim().min(1).max(100).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  logic: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  mitreTechniqueIds: z.array(z.string().max(50)).max(50).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const [rule] = await db
      .select()
      .from(detectionRules)
      .where(and(eq(detectionRules.id, params.id), eq(detectionRules.orgId, session.user.orgId)))
      .limit(1)

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    return NextResponse.json(rule)
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load rule', details: err.message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

    const parsed = await parseJsonBody(req, detectionRuleUpdateSchema)
    if (!parsed.ok) return parsed.response
    const body = parsed.data

    const [existing] = await db
      .select({ id: detectionRules.id, name: detectionRules.name, enabled: detectionRules.enabled, severity: detectionRules.severity })
      .from(detectionRules)
      .where(and(eq(detectionRules.id, params.id), eq(detectionRules.orgId, session.user.orgId)))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    const [updated] = await db
      .update(detectionRules)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.threatType !== undefined && { threatType: body.threatType }),
        ...(body.killChainPhase !== undefined && { killChainPhase: body.killChainPhase }),
        ...(body.severity !== undefined && { severity: body.severity }),
        ...(body.logic !== undefined && { logic: body.logic }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.mitreTechniqueIds !== undefined && { mitreTechniqueIds: body.mitreTechniqueIds }),
        updatedAt: new Date(),
      })
      .where(eq(detectionRules.id, params.id))
      .returning()

    await logAction({
      actionType: 'manage_detection_rule',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      payload: {
        operation: 'update',
        ruleId: params.id,
        name: updated?.name ?? existing.name,
        changedFields: changedKeys(body),
        ...(body.enabled !== undefined && { previousEnabled: existing.enabled, newEnabled: body.enabled }),
        ...(body.severity !== undefined && { previousSeverity: existing.severity, newSeverity: body.severity }),
      },
    })

    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to update rule', details: err.message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

    const [existing] = await db
      .select({ id: detectionRules.id, name: detectionRules.name, threatType: detectionRules.threatType })
      .from(detectionRules)
      .where(and(eq(detectionRules.id, params.id), eq(detectionRules.orgId, session.user.orgId)))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    await db.delete(detectionRules).where(eq(detectionRules.id, params.id))

    await logAction({
      actionType: 'manage_detection_rule',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      payload: { operation: 'delete', ruleId: params.id, name: existing.name, threatType: existing.threatType },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to delete rule', details: err.message }, { status: 500 })
  }
}

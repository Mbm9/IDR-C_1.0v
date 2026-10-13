import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { automationRules } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { z } from 'zod'
import { logAction, parseJsonBody, changedKeys, badRequest } from '@/lib/actions/helpers'

const TRIGGER_TYPES = ['data_change', 'threshold_breach', 'schedule', 'time_elapsed'] as const
const RULE_ACTION_TYPES = ['disable_identity', 'revoke_entitlement', 'create_alert', 'create_violation', 'update_status', 'notify'] as const

const updateRuleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  triggerType: z.enum(TRIGGER_TYPES).optional(),
  triggerCondition: z.record(z.string(), z.unknown()).optional(),
  actionType: z.enum(RULE_ACTION_TYPES).optional(),
  actionParams: z.record(z.string(), z.unknown()).optional(),
  notifyTargets: z.array(z.string().max(100)).max(50).optional(),
  enabled: z.boolean().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const [rule] = await db.select()
    .from(automationRules)
    .where(and(
      eq(automationRules.id, id),
      eq(automationRules.orgId, session.user.orgId),
    ))
    .limit(1)

  if (!rule) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(rule)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRole = (session.user as any)?.appRole as AppRole | undefined
  if (!userRole || !hasRole(userRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const parsed = await parseJsonBody(req, updateRuleSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const updates: Record<string, any> = {}

  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.triggerType !== undefined) updates.triggerType = body.triggerType
  if (body.triggerCondition !== undefined) updates.triggerCondition = body.triggerCondition
  if (body.actionType !== undefined) updates.actionType = body.actionType
  if (body.actionParams !== undefined) updates.actionParams = body.actionParams
  if (body.notifyTargets !== undefined) updates.notifyTargets = body.notifyTargets
  if (body.enabled !== undefined) updates.enabled = body.enabled

  if (Object.keys(updates).length === 0) {
    return badRequest('Invalid input', { formErrors: ['No updatable fields provided'], fieldErrors: {} })
  }

  try {
    const [before] = await db.select({ enabled: automationRules.enabled })
      .from(automationRules)
      .where(and(eq(automationRules.id, id), eq(automationRules.orgId, session.user.orgId)))
      .limit(1)
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [rule] = await db.update(automationRules)
      .set(updates)
      .where(and(
        eq(automationRules.id, id),
        eq(automationRules.orgId, session.user.orgId),
      ))
      .returning()

    if (!rule) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await logAction({
      actionType: 'manage_automation_rule',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      payload: {
        operation: 'update',
        ruleId: id,
        name: rule.name,
        changedFields: changedKeys(body),
        ...(body.enabled !== undefined && { previousEnabled: before.enabled, newEnabled: body.enabled }),
      },
    })

    return NextResponse.json(rule)
  } catch (error) {
    console.error('Update automation rule error:', error)
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRole = (session.user as any)?.appRole as AppRole | undefined
  if (!userRole || !hasRole(userRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const [rule] = await db.delete(automationRules)
    .where(and(
      eq(automationRules.id, id),
      eq(automationRules.orgId, session.user.orgId),
    ))
    .returning()

  if (!rule) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await logAction({
    actionType: 'manage_automation_rule',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    payload: { operation: 'delete', ruleId: id, name: rule.name, triggerType: rule.triggerType, actionType: rule.actionType },
  })

  return NextResponse.json({ success: true })
}

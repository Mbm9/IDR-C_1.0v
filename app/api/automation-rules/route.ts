import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { automationRules } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { z } from 'zod'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'

const TRIGGER_TYPES = ['data_change', 'threshold_breach', 'schedule', 'time_elapsed'] as const
const RULE_ACTION_TYPES = ['disable_identity', 'revoke_entitlement', 'create_alert', 'create_violation', 'update_status', 'notify'] as const

const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  triggerType: z.enum(TRIGGER_TYPES),
  triggerCondition: z.record(z.string(), z.unknown()),
  actionType: z.enum(RULE_ACTION_TYPES),
  actionParams: z.record(z.string(), z.unknown()).optional(),
  notifyTargets: z.array(z.string().max(100)).max(50).optional(),
  enabled: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rules = await db.select()
    .from(automationRules)
    .where(eq(automationRules.orgId, session.user.orgId))
    .orderBy(desc(automationRules.createdAt))

  return NextResponse.json({ rules })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRole = (session.user as any)?.appRole as AppRole | undefined
  if (!userRole || !hasRole(userRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = await parseJsonBody(req, createRuleSchema)
  if (!parsed.ok) return parsed.response

  try {
    const { name, description, triggerType, triggerCondition, actionType, actionParams, notifyTargets, enabled } = parsed.data

    const [rule] = await db.insert(automationRules).values({
      name,
      description: description || null,
      triggerType,
      triggerCondition,
      actionType,
      actionParams: actionParams || {},
      notifyTargets: notifyTargets || [],
      enabled: enabled ?? true,
      createdBy: (session.user as any).id,
      orgId: session.user.orgId,
    }).returning()

    await logAction({
      actionType: 'manage_automation_rule',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      payload: { operation: 'create', ruleId: rule.id, name, triggerType, actionType, enabled: rule.enabled },
    })

    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    console.error('Create automation rule error:', error)
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { detectionRules } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { unauthorized, forbidden, logAction, parseJsonBody } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'
import { z } from 'zod'

const detectionRuleCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  threatType: z.string().trim().min(1).max(100),
  killChainPhase: z.string().trim().min(1).max(100),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  logic: z.record(z.string(), z.unknown()),
  mitreTechniqueIds: z.array(z.string().max(50)).max(50).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const rules = await db
      .select()
      .from(detectionRules)
      .where(eq(detectionRules.orgId, session.user.orgId))

    return NextResponse.json({ rules })
  } catch (err: any) {
    console.error('[Detection Rules GET] Error:', err)
    return NextResponse.json({ error: 'Failed to load detection rules', details: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

    const parsed = await parseJsonBody(req, detectionRuleCreateSchema)
    if (!parsed.ok) return parsed.response
    const { name, description, threatType, killChainPhase, severity, logic, mitreTechniqueIds } = parsed.data

    const [rule] = await db.insert(detectionRules).values({
      name,
      description,
      threatType,
      killChainPhase,
      severity,
      logic,
      mitreTechniqueIds: mitreTechniqueIds || [],
      orgId: session.user.orgId,
    }).returning()

    await logAction({
      actionType: 'manage_detection_rule',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      payload: { operation: 'create', ruleId: rule.id, name, threatType, killChainPhase, severity },
    })

    return NextResponse.json(rule, { status: 201 })
  } catch (err: any) {
    console.error('[Detection Rules POST] Error:', err)
    return NextResponse.json({ error: 'Failed to create rule', details: err.message }, { status: 500 })
  }
}

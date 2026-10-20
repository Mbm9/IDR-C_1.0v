import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { remediationPlans } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, badRequest } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()

  const plans = await db.select().from(remediationPlans)
    .where(eq(remediationPlans.orgId, session.user.orgId))
    .orderBy(desc(remediationPlans.generatedAt))
    .limit(20)

  return NextResponse.json({ plans })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()
  if (!hasRole((session.user as any).appRole as AppRole, 'ciso')) return forbidden()

  const { planId, action } = await req.json()
  if (!planId || !['approved', 'rejected'].includes(action)) {
    return badRequest('Invalid input: planId and action (approved|rejected) required')
  }

  const [plan] = await db.select().from(remediationPlans)
    .where(and(eq(remediationPlans.id, planId), eq(remediationPlans.orgId, session.user.orgId)))
    .limit(1)

  if (!plan) return badRequest('Plan not found')

  await db.update(remediationPlans)
    .set({
      status: action,
      approvedBy: action === 'approved' ? session.user.id : undefined,
      approvedAt: action === 'approved' ? new Date() : undefined,
    })
    .where(eq(remediationPlans.id, planId))

  await logAction({
    actionType: 'generate_recommendation',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    rationale: `Plan ${action}`,
    payload: { planId, action },
  })

  return NextResponse.json({ success: true, planId, status: action })
}

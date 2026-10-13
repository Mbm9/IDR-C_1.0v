import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { remediationPlans } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { executeApprovedActions } from '@/lib/remediation/tier-proposals'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'
import { z } from 'zod'

const decisionSchema = z.object({
  action: z.enum(['approve', 'reject'], { message: 'Invalid action. Use "approve" or "reject"' }),
  reason: z.string().max(2000).optional(),
})

/**
 * GET /api/remediation/[id]
 *
 * Get a single remediation plan with all its proposed actions.
 */
export const GET = withApiHandler(async (
  req: NextRequest,
  { orgId, log },
) => {
  const id = req.nextUrl.pathname.split('/').pop()!

  const [plan] = await db.select()
    .from(remediationPlans)
    .where(and(eq(remediationPlans.id, id), eq(remediationPlans.orgId, orgId)))
    .limit(1)

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  return NextResponse.json({ plan })
})

/**
 * PUT /api/remediation/[id]
 *
 * Approve or reject a remediation plan.
 *
 * Body:
 *   { action: 'approve' }  — Approves the plan and executes all actions
 *   { action: 'reject', reason: '...' }  — Rejects the plan with rationale
 *
 * Only CISO or Admin can approve/reject plans.
 */
export const PUT = withApiHandler(async (
  req: NextRequest,
  { orgId, session, log },
) => {
  const id = req.nextUrl.pathname.split('/').pop()!
  const parsed = await parseJsonBody(req, decisionSchema)
  if (!parsed.ok) return parsed.response
  const { action, reason } = parsed.data

  // Fetch the plan
  const [plan] = await db.select()
    .from(remediationPlans)
    .where(and(eq(remediationPlans.id, id), eq(remediationPlans.orgId, orgId)))
    .limit(1)

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  if (plan.status !== 'draft') {
    return NextResponse.json(
      { error: `Plan is already '${plan.status}'. Only draft plans can be approved/rejected.` },
      { status: 409 }
    )
  }

  if (action === 'reject') {
    // Reject the plan
    await db.update(remediationPlans)
      .set({ status: 'rejected' })
      .where(eq(remediationPlans.id, id))

    await logAction({
      actionType: 'manage_remediation',
      actorIdentityId: session.user.id,
      orgId,
      rationale: reason || 'No reason provided',
      payload: { operation: 'reject', planId: id, previousStatus: plan.status, newStatus: 'rejected' },
    })

    log.info('Remediation plan rejected', { planId: id, reason })

    return NextResponse.json({ success: true, planId: id, status: 'rejected' })
  }

  // Approve the plan. approvedBy is an FK to identities and app users are not
  // identities, so the approving user is recorded in the action_log entry instead.
  await db.update(remediationPlans)
    .set({
      status: 'approved',
      approvedAt: new Date(),
    })
    .where(eq(remediationPlans.id, id))

  await logAction({
    actionType: 'manage_remediation',
    actorIdentityId: session.user.id,
    orgId,
    rationale: reason || 'Remediation plan approved — executing actions',
    payload: { operation: 'approve', planId: id, previousStatus: plan.status, newStatus: 'approved' },
  })

  // Execute the approved actions
  const result = await executeApprovedActions(id, orgId, session.user.id)

  await logAction({
    actionType: 'manage_remediation',
    actorIdentityId: session.user.id,
    orgId,
    source: 'automated',
    payload: { operation: 'execute', planId: id, executed: result.executed, failed: result.failed },
  })

  log.info('Remediation plan approved and executed', {
    planId: id,
    executed: result.executed,
    failed: result.failed,
  })

  return NextResponse.json({
    success: true,
    planId: id,
    status: 'completed',
    execution: result,
  })
}, { requiredRole: 'ciso' })

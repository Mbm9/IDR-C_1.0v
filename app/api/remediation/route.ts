import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { remediationPlans } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { generateTierRemediationProposals } from '@/lib/remediation/tier-proposals'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'
import { z } from 'zod'

const generateSchema = z.object({
  type: z.literal('tier_violations', { message: 'Invalid type. Supported: tier_violations' }),
})

/**
 * GET /api/remediation
 *
 * List all remediation plans, ordered by most recent.
 * Shows draft (pending approval), approved, completed, and rejected plans.
 */
export const GET = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const status = req.nextUrl.searchParams.get('status') || undefined

  let query = db.select().from(remediationPlans)
    .where(eq(remediationPlans.orgId, orgId))
    .orderBy(desc(remediationPlans.createdAt))
    .limit(50)

  const plans = await query

  // Optionally filter by status client-side (Drizzle dynamic where is verbose)
  const filtered = status
    ? plans.filter(p => p.status === status)
    : plans

  log.info('Remediation plans listed', { total: filtered.length, statusFilter: status })

  return NextResponse.json({ plans: filtered })
})

/**
 * POST /api/remediation
 *
 * Generate new tier violation remediation proposals.
 * Scans all active identities for tier violations and creates
 * a remediation plan with specific actions awaiting approval.
 *
 * Body: { type: 'tier_violations' }
 */
export const POST = withApiHandler(async (req: NextRequest, { orgId, session, log }) => {
  const parsed = await parseJsonBody(req, generateSchema)
  if (!parsed.ok) return parsed.response
  const { type } = parsed.data

  const result = await generateTierRemediationProposals(orgId)

  await logAction({
    actionType: 'manage_remediation',
    actorIdentityId: session.user.id,
    orgId,
    payload: {
      operation: 'generate',
      type,
      planId: result.planId,
      totalViolations: result.totalViolations,
      proposedActions: result.proposedActions,
    },
  })

  log.info('Remediation proposals generated', result)

  return NextResponse.json(result, { status: 201 })
}, { requiredRole: 'analyst' })

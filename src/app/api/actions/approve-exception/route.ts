import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { policyViolations } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { approveExceptionInputSchema } from '@/lib/schemas/action'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, badRequest } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()
  if (!hasRole((session.user as any).appRole as AppRole, 'ciso')) return forbidden()

  const body = await req.json()
  const parsed = approveExceptionInputSchema.safeParse(body)
  if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

  const { violationId, reason, expiresAt } = parsed.data
  const orgId = session.user.orgId

  const [violation] = await db.select().from(policyViolations)
    .where(and(eq(policyViolations.id, violationId), eq(policyViolations.orgId, orgId)))
    .limit(1)

  if (!violation) return badRequest('Violation not found')

  await db.update(policyViolations)
    .set({
      status: 'excepted',
      exceptionReason: reason,
      exceptionApprovedBy: session.user.id,
      exceptionExpiresAt: new Date(expiresAt),
    })
    .where(eq(policyViolations.id, violationId))

  await logAction({
    actionType: 'approve_exception',
    actorIdentityId: session.user.id,
    orgId,
    targetPolicyViolationId: violationId,
    targetIdentityId: violation.identityId,
    rationale: reason,
    payload: { violationId, expiresAt },
  })

  return Response.json({ success: true, violationId, approvedAt: new Date().toISOString() })
}

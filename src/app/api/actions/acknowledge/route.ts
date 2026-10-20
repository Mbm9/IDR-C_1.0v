import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { policyViolations } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { acknowledgeViolationInputSchema } from '@/lib/schemas/action'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, badRequest } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()
  if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

  const body = await req.json()
  const parsed = acknowledgeViolationInputSchema.safeParse(body)
  if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

  const { violationId, rationale } = parsed.data
  const orgId = session.user.orgId

  const [violation] = await db.select().from(policyViolations)
    .where(and(eq(policyViolations.id, violationId), eq(policyViolations.orgId, orgId)))
    .limit(1)

  if (!violation) return badRequest('Violation not found')

  await db.update(policyViolations)
    .set({ status: 'acknowledged' })
    .where(eq(policyViolations.id, violationId))

  await logAction({
    actionType: 'acknowledge_violation',
    actorIdentityId: session.user.id,
    orgId,
    targetPolicyViolationId: violationId,
    targetIdentityId: violation.identityId,
    rationale,
    payload: { violationId },
  })

  return Response.json({ success: true, violationId, acknowledgedAt: new Date().toISOString() })
}

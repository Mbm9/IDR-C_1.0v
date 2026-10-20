import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { escalateRiskInputSchema } from '@/lib/schemas/action'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, badRequest } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()
  if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

  const body = await req.json()
  const parsed = escalateRiskInputSchema.safeParse(body)
  if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

  const { identityId, reason, newRiskScore } = parsed.data
  const orgId = session.user.orgId

  const [identity] = await db.select().from(identities)
    .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))
    .limit(1)

  if (!identity) return badRequest('Identity not found')

  const previousScore = identity.riskScore
  const updatedScore = newRiskScore ?? Math.min(100, previousScore + 20)

  await db.update(identities)
    .set({ riskScore: updatedScore })
    .where(eq(identities.id, identityId))

  await logAction({
    actionType: 'escalate_risk',
    actorIdentityId: session.user.id,
    orgId,
    targetIdentityId: identityId,
    rationale: reason,
    payload: { previousScore, newScore: updatedScore },
  })

  return Response.json({ success: true, identityId, previousScore, newScore: updatedScore })
}

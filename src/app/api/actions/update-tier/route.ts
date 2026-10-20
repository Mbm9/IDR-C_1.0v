import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { updateTierInputSchema } from '@/lib/schemas/action'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, badRequest } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

  const body = await req.json()
  const parsed = updateTierInputSchema.safeParse(body)
  if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

  const { identityId, newTier, rationale } = parsed.data
  const orgId = session.user.orgId

  const [identity] = await db.select().from(identities)
    .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))
    .limit(1)

  if (!identity) return badRequest('Identity not found')

  const previousTier = identity.adTier

  await db.update(identities)
    .set({ adTier: newTier, updatedAt: new Date() })
    .where(eq(identities.id, identityId))

  await logAction({
    actionType: 'update_tier',
    actorIdentityId: session.user.id,
    orgId,
    targetIdentityId: identityId,
    rationale,
    payload: { previousTier, newTier },
  })

  return Response.json({ success: true, identityId, previousTier, newTier })
}

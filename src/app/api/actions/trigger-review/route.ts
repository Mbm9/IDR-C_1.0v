import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { triggerReviewInputSchema } from '@/lib/schemas/action'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, badRequest } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()
  if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

  const body = await req.json()
  const parsed = triggerReviewInputSchema.safeParse(body)
  if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

  const { identityIds, reviewType } = parsed.data
  const orgId = session.user.orgId

  // Log the review trigger for each identity
  for (const identityId of identityIds) {
    await logAction({
      actionType: 'trigger_review',
      actorIdentityId: session.user.id,
      orgId,
      targetIdentityId: identityId,
      rationale: `${reviewType} review triggered`,
      payload: { reviewType, identityIds },
    })
  }

  return Response.json({
    success: true,
    reviewId: crypto.randomUUID(),
    identityCount: identityIds.length,
    triggeredAt: new Date().toISOString(),
  })
}

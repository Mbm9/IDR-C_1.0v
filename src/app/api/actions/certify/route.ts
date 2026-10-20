import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { entitlements } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { certifyEntitlementInputSchema } from '@/lib/schemas/action'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, badRequest } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

  const body = await req.json()
  const parsed = certifyEntitlementInputSchema.safeParse(body)
  if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

  const { entitlementId, rationale } = parsed.data
  const orgId = session.user.orgId

  const [ent] = await db.select().from(entitlements)
    .where(and(eq(entitlements.id, entitlementId), eq(entitlements.orgId, orgId)))
    .limit(1)

  if (!ent) return badRequest('Entitlement not found')

  await db.update(entitlements)
    .set({
      certificationStatus: 'certified',
      lastCertifiedAt: new Date(),
      certifiedBy: session.user.id,
    })
    .where(eq(entitlements.id, entitlementId))

  await logAction({
    actionType: 'certify_entitlement',
    actorIdentityId: session.user.id,
    orgId,
    targetEntitlementId: entitlementId,
    rationale,
    payload: { entitlementId, certifiedAt: new Date().toISOString() },
  })

  return Response.json({ success: true, entitlementId, certifiedAt: new Date().toISOString() })
}

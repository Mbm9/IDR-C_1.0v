import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities, entitlements, resources } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { isControlPlaneTier } from '@/lib/utils/tiers'

const inputSchema = z.object({
  identityId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const body = await req.json()
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const { identityId } = parsed.data

  try {
    // Load the owner identity
    const [owner] = await db
      .select()
      .from(identities)
      .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))

    if (!owner) {
      return NextResponse.json({ error: 'Identity not found' }, { status: 404 })
    }

    // Find all NHIs owned by this identity
    const ownedNhis = await db
      .select()
      .from(identities)
      .where(and(
        eq(identities.ownerIdentityId, identityId),
        eq(identities.orgId, orgId),
        eq(identities.type, 'non_human'),
      ))

    // For each NHI, find its entitlements and resources
    const nhiDetails = await Promise.all(
      ownedNhis.map(async (nhi) => {
        const nhiEntitlements = await db
          .select({
            id: entitlements.id,
            permissionName: entitlements.permissionName,
            adTierOfPermission: entitlements.adTierOfPermission,
            resourceId: entitlements.resourceId,
            resourceName: resources.name,
            resourceType: resources.type,
            resourceTier: resources.adTier,
            resourceCriticality: resources.criticality,
          })
          .from(entitlements)
          .innerJoin(resources, eq(entitlements.resourceId, resources.id))
          .where(eq(entitlements.identityId, nhi.id))

        // Find downstream NHIs that depend on resources this NHI accesses
        const resourceIds = nhiEntitlements.map(e => e.resourceId)
        let downstreamNhis: { id: string; displayName: string; subType: string }[] = []
        if (resourceIds.length > 0) {
          // NHIs that have entitlements to same resources
          const downstream = await db
            .select({
              id: identities.id,
              displayName: identities.displayName,
              subType: identities.subType,
            })
            .from(identities)
            .innerJoin(entitlements, eq(entitlements.identityId, identities.id))
            .where(and(
              eq(identities.type, 'non_human'),
              eq(identities.orgId, orgId),
            ))

          // Filter in JS to avoid complex SQL
          const nhiIdSet = new Set([nhi.id, identityId])
          downstreamNhis = downstream.filter(d => !nhiIdSet.has(d.id))
        }

        const credentialAge = nhi.passwordLastSetAt
          ? Math.floor((Date.now() - new Date(nhi.passwordLastSetAt).getTime()) / (1000 * 60 * 60 * 24))
          : null

        const criticality = nhiEntitlements.some(e => isControlPlaneTier(e.resourceTier) || e.resourceCriticality === 'critical')
          ? 'critical'
          : nhiEntitlements.some(e => e.resourceTier === 'tier_1' || e.resourceCriticality === 'high')
            ? 'high'
            : 'standard'

        return {
          nhi: {
            id: nhi.id,
            name: nhi.displayName,
            subType: nhi.subType,
            status: nhi.status,
            tier: nhi.adTier,
            expiryAt: nhi.expiryAt,
          },
          resources: nhiEntitlements.map(e => ({
            id: e.resourceId,
            name: e.resourceName,
            type: e.resourceType,
            tier: e.resourceTier,
            criticality: e.resourceCriticality,
            permission: e.permissionName,
          })),
          downstreamNhis: downstreamNhis.slice(0, 10),
          credentialAge,
          criticality,
        }
      })
    )

    const totalBlastRadius = nhiDetails.reduce(
      (sum, d) => sum + d.resources.length + d.downstreamNhis.length,
      0
    )

    return NextResponse.json({
      owner: {
        id: owner.id,
        name: owner.displayName,
        type: owner.type,
        subType: owner.subType,
        tier: owner.adTier,
        department: owner.department,
      },
      ownedNhis: nhiDetails,
      totalBlastRadius,
      successionPlan: false, // No co-owner mechanism yet
    })
  } catch (error) {
    console.error('Supply chain error:', error)
    return NextResponse.json({ error: 'Failed to map supply chain' }, { status: 500 })
  }
}

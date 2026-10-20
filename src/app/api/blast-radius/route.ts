import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities, entitlements, resources, groups, groupMemberships } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { isControlPlaneTier } from '@/lib/utils/tiers'

const inputSchema = z.object({
  identityId: z.string().uuid(),
  maxDepth: z.number().int().min(1).max(5).default(3),
})

interface BlastNode {
  id: string
  name: string
  type: 'identity' | 'resource' | 'group'
  subType?: string
  tier?: string
  criticality?: string
}

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

  const { identityId, maxDepth } = parsed.data

  try {
    // Load center identity
    const [center] = await db
      .select()
      .from(identities)
      .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))

    if (!center) {
      return NextResponse.json({ error: 'Identity not found' }, { status: 404 })
    }

    // Load all entitlements for the org
    const orgEntitlements = await db
      .select({
        id: entitlements.id,
        identityId: entitlements.identityId,
        resourceId: entitlements.resourceId,
        permissionName: entitlements.permissionName,
        adTierOfPermission: entitlements.adTierOfPermission,
      })
      .from(entitlements)
      .where(eq(entitlements.orgId, orgId))

    // Load all group memberships
    const orgMemberships = await db
      .select({
        groupId: groupMemberships.groupId,
        identityId: groupMemberships.identityId,
      })
      .from(groupMemberships)
      .where(eq(groupMemberships.orgId, orgId))

    // Load resources
    const orgResources = await db
      .select({
        id: resources.id,
        name: resources.name,
        type: resources.type,
        adTier: resources.adTier,
        criticality: resources.criticality,
      })
      .from(resources)
      .where(eq(resources.orgId, orgId))

    // Load groups
    const orgGroups = await db
      .select({
        id: groups.id,
        name: groups.name,
        adTier: groups.adTier,
        isPrivileged: groups.isPrivileged,
      })
      .from(groups)
      .where(eq(groups.orgId, orgId))

    // Load identities
    const orgIdentities = await db
      .select({
        id: identities.id,
        displayName: identities.displayName,
        type: identities.type,
        subType: identities.subType,
        adTier: identities.adTier,
        ownerIdentityId: identities.ownerIdentityId,
      })
      .from(identities)
      .where(eq(identities.orgId, orgId))

    // Build adjacency maps
    const resourceMap = new Map(orgResources.map(r => [r.id, r]))
    const groupMap = new Map(orgGroups.map(g => [g.id, g]))
    const identityMap = new Map(orgIdentities.map(i => [i.id, i]))

    // BFS from center identity
    const visited = new Set<string>()
    visited.add(identityId)
    const rings: { depth: number; nodes: BlastNode[] }[] = []
    let currentFrontier = new Set<string>([identityId])

    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextFrontier = new Set<string>()
      const ringNodes: BlastNode[] = []

      for (const nodeId of currentFrontier) {
        // From identity: find resources via entitlements
        const nodeEntitlements = orgEntitlements.filter(e => e.identityId === nodeId)
        for (const ent of nodeEntitlements) {
          if (!visited.has(ent.resourceId)) {
            visited.add(ent.resourceId)
            const resource = resourceMap.get(ent.resourceId)
            if (resource) {
              ringNodes.push({
                id: resource.id,
                name: resource.name,
                type: 'resource',
                subType: resource.type,
                tier: resource.adTier,
                criticality: resource.criticality,
              })
              nextFrontier.add(resource.id)
            }
          }
        }

        // From identity: find groups via memberships
        const nodeMemberships = orgMemberships.filter(m => m.identityId === nodeId)
        for (const mem of nodeMemberships) {
          if (!visited.has(mem.groupId)) {
            visited.add(mem.groupId)
            const group = groupMap.get(mem.groupId)
            if (group) {
              ringNodes.push({
                id: group.id,
                name: group.name,
                type: 'group',
                tier: group.adTier,
              })
              nextFrontier.add(group.id)

              // From group: find other members
              const groupMembers = orgMemberships.filter(m => m.groupId === mem.groupId)
              for (const gm of groupMembers) {
                if (!visited.has(gm.identityId)) {
                  visited.add(gm.identityId)
                  const ident = identityMap.get(gm.identityId)
                  if (ident) {
                    ringNodes.push({
                      id: ident.id,
                      name: ident.displayName,
                      type: 'identity',
                      subType: ident.subType,
                      tier: ident.adTier,
                    })
                    nextFrontier.add(ident.id)
                  }
                }
              }
            }
          }
        }

        // From identity: find owned NHIs
        const ownedNhis = orgIdentities.filter(i => i.ownerIdentityId === nodeId)
        for (const nhi of ownedNhis) {
          if (!visited.has(nhi.id)) {
            visited.add(nhi.id)
            ringNodes.push({
              id: nhi.id,
              name: nhi.displayName,
              type: 'identity',
              subType: nhi.subType,
              tier: nhi.adTier,
            })
            nextFrontier.add(nhi.id)
          }
        }
      }

      if (ringNodes.length > 0) {
        rings.push({ depth, nodes: ringNodes })
      }
      currentFrontier = nextFrontier
    }

    // Compute stats
    const allNodes = rings.flatMap(r => r.nodes)
    const totalReachable = allNodes.length
    const tierBreaches = allNodes.filter(
      n => isControlPlaneTier(n.tier) && center.adTier === 'tier_2'
    ).length
    const criticalAssets = allNodes.filter(
      n => n.criticality === 'critical' || isControlPlaneTier(n.tier)
    ).length

    return NextResponse.json({
      center: {
        id: center.id,
        name: center.displayName,
        type: center.type,
        subType: center.subType,
        tier: center.adTier,
        riskScore: center.riskScore,
      },
      rings,
      stats: {
        totalReachable,
        tierBreaches,
        criticalAssets,
        identityCount: allNodes.filter(n => n.type === 'identity').length,
        resourceCount: allNodes.filter(n => n.type === 'resource').length,
        groupCount: allNodes.filter(n => n.type === 'group').length,
      },
    })
  } catch (error) {
    console.error('Blast radius error:', error)
    return NextResponse.json({ error: 'Failed to compute blast radius' }, { status: 500 })
  }
}

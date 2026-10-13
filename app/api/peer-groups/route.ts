import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { peerGroups, peerAnomalies, identities, entitlements } from '@/lib/db/schema'
import { eq, and, sql, desc, count as drizzleCount } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await db
      .select()
      .from(peerGroups)
      .where(eq(peerGroups.orgId, session.user.orgId))
      .orderBy(desc(peerGroups.memberCount))

    return NextResponse.json({ items: results })
  } catch (error) {
    console.error('Peer groups GET error:', error)
    return NextResponse.json({ error: 'Failed to load peer groups' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Re-running the scan replaces stored findings, so it needs the triage role.
  if (!hasRole((session.user.appRole ?? 'viewer') as AppRole, 'analyst')) {
    return NextResponse.json({ error: 'Forbidden: analyst role required' }, { status: 403 })
  }

  const orgId = session.user.orgId

  try {
    // Load all active identities with departments
    const orgIdentities = await db
      .select({
        id: identities.id,
        department: identities.department,
        adTier: identities.adTier,
        subType: identities.subType,
        displayName: identities.displayName,
      })
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.status, 'active'),
      ))

    // Count entitlements per identity
    const entitlementCounts = await db
      .select({
        identityId: entitlements.identityId,
        count: sql<number>`count(*)::int`,
      })
      .from(entitlements)
      .where(eq(entitlements.orgId, orgId))
      .groupBy(entitlements.identityId)

    const countMap = new Map(entitlementCounts.map(e => [e.identityId, e.count]))

    // Get entitlement details for each identity
    const allEntitlements = await db
      .select({
        identityId: entitlements.identityId,
        permissionName: entitlements.permissionName,
        adTierOfPermission: entitlements.adTierOfPermission,
      })
      .from(entitlements)
      .where(eq(entitlements.orgId, orgId))

    // Group identities by (department, adTier, subType)
    const groups = new Map<string, typeof orgIdentities>()
    for (const identity of orgIdentities) {
      const dept = identity.department || 'Unknown'
      const key = `${dept}|${identity.adTier}|${identity.subType}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(identity)
    }

    // Clear old peer groups and anomalies
    await db.delete(peerAnomalies).where(eq(peerAnomalies.orgId, orgId))
    await db.delete(peerGroups).where(eq(peerGroups.orgId, orgId))

    const newPeerGroups: (typeof peerGroups.$inferInsert)[] = []
    const newAnomalies: (typeof peerAnomalies.$inferInsert)[] = []

    for (const [key, members] of groups) {
      if (members.length < 3) continue // Need at least 3 for meaningful stats

      const [department, adTier, subType] = key.split('|')
      const counts = members.map(m => countMap.get(m.id) || 0)
      counts.sort((a, b) => a - b)

      const median = counts[Math.floor(counts.length / 2)]
      const avg = counts.reduce((s, c) => s + c, 0) / counts.length
      const variance = counts.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / counts.length
      const stddev = Math.sqrt(variance) || 1 // avoid division by zero

      // Compute common entitlements (>80% of members have)
      const permFreq = new Map<string, number>()
      for (const member of members) {
        const memberEnts = allEntitlements.filter(e => e.identityId === member.id)
        const uniquePerms = new Set(memberEnts.map(e => e.permissionName))
        for (const perm of uniquePerms) {
          permFreq.set(perm, (permFreq.get(perm) || 0) + 1)
        }
      }
      const commonEntitlements = Array.from(permFreq.entries())
        .filter(([, freq]) => freq / members.length >= 0.8)
        .map(([permissionName, freq]) => ({
          permissionName,
          percentage: Math.round((freq / members.length) * 100),
        }))

      const peerGroupId = crypto.randomUUID()
      newPeerGroups.push({
        id: peerGroupId,
        name: `${department} / ${adTier} / ${subType}`,
        department,
        adTier: adTier as any,
        subType: subType as any,
        memberCount: members.length,
        medianEntitlementCount: median,
        avgEntitlementCount: avg,
        stddevEntitlementCount: stddev,
        commonEntitlements,
        orgId,
      })

      // Detect anomalies: >2 stddev from median
      for (const member of members) {
        const memberCount = countMap.get(member.id) || 0
        const deviation = (memberCount - median) / stddev

        if (deviation > 2) {
          // Find excess entitlements (entitlements this member has that <20% of peers have)
          const memberPerms = allEntitlements
            .filter(e => e.identityId === member.id)
            .map(e => e.permissionName)
          const commonPermNames = new Set(commonEntitlements.map(ce => ce.permissionName))

          const excessEntitlements = memberPerms
            .filter(p => !commonPermNames.has(p))
            .map(p => {
              const peersWithSame = permFreq.get(p) || 0
              const ent = allEntitlements.find(e => e.identityId === member.id && e.permissionName === p)
              return {
                permissionName: p,
                tier: ent?.adTierOfPermission || 'unknown',
                peersWithSame,
              }
            })

          const uniqueEntitlements = memberPerms
            .filter(p => (permFreq.get(p) || 0) <= 1)
            .map(p => {
              const ent = allEntitlements.find(e => e.identityId === member.id && e.permissionName === p)
              return { permissionName: p, tier: ent?.adTierOfPermission || 'unknown' }
            })

          newAnomalies.push({
            identityId: member.id,
            peerGroupId,
            anomalyType: uniqueEntitlements.length > 0 ? 'unique_entitlements' : 'excess_entitlements',
            entitlementCount: memberCount,
            peerMedian: median,
            deviationScore: Math.round(deviation * 100) / 100,
            excessEntitlements,
            uniqueEntitlements,
            status: 'open',
            orgId,
          })
        }
      }
    }

    // Insert
    if (newPeerGroups.length > 0) {
      await db.insert(peerGroups).values(newPeerGroups)
    }
    if (newAnomalies.length > 0) {
      await db.insert(peerAnomalies).values(newAnomalies)
    }

    return NextResponse.json({
      success: true,
      peerGroupsCreated: newPeerGroups.length,
      anomaliesDetected: newAnomalies.length,
    })
  } catch (error) {
    console.error('Peer group computation error:', error)
    return NextResponse.json({ error: 'Failed to compute peer groups' }, { status: 500 })
  }
}

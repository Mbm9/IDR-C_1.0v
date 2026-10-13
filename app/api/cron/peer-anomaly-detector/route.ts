import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { peerGroups, peerAnomalies, identities, entitlements, organizations } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalGroups = 0
    let totalAnomalies = 0

    for (const org of allOrgs) {
      const orgId = org.id

      // Load active identities
      const orgIdentities = await db
        .select({
          id: identities.id,
          department: identities.department,
          adTier: identities.adTier,
          subType: identities.subType,
        })
        .from(identities)
        .where(and(eq(identities.orgId, orgId), eq(identities.status, 'active')))

      // Entitlement counts
      const entCounts = await db
        .select({
          identityId: entitlements.identityId,
          count: sql<number>`count(*)::int`,
        })
        .from(entitlements)
        .where(eq(entitlements.orgId, orgId))
        .groupBy(entitlements.identityId)

      const countMap = new Map(entCounts.map(e => [e.identityId, e.count]))

      // Group by (dept, tier, subType)
      const grouped = new Map<string, typeof orgIdentities>()
      for (const id of orgIdentities) {
        const dept = id.department || 'Unknown'
        const key = `${dept}|${id.adTier}|${id.subType}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(id)
      }

      // Clear old
      await db.delete(peerAnomalies).where(eq(peerAnomalies.orgId, orgId))
      await db.delete(peerGroups).where(eq(peerGroups.orgId, orgId))

      const newGroups: (typeof peerGroups.$inferInsert)[] = []
      const newAnomalies: (typeof peerAnomalies.$inferInsert)[] = []

      for (const [key, members] of grouped) {
        if (members.length < 3) continue

        const [department, adTier, subType] = key.split('|')
        const counts = members.map(m => countMap.get(m.id) || 0).sort((a, b) => a - b)
        const median = counts[Math.floor(counts.length / 2)]
        const avg = counts.reduce((s, c) => s + c, 0) / counts.length
        const variance = counts.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / counts.length
        const stddev = Math.sqrt(variance) || 1

        const pgId = crypto.randomUUID()
        newGroups.push({
          id: pgId,
          name: `${department} / ${adTier} / ${subType}`,
          department,
          adTier: adTier as any,
          subType: subType as any,
          memberCount: members.length,
          medianEntitlementCount: median,
          avgEntitlementCount: avg,
          stddevEntitlementCount: stddev,
          commonEntitlements: [],
          orgId,
        })

        for (const member of members) {
          const mc = countMap.get(member.id) || 0
          const deviation = (mc - median) / stddev
          if (deviation > 2) {
            newAnomalies.push({
              identityId: member.id,
              peerGroupId: pgId,
              anomalyType: 'excess_entitlements',
              entitlementCount: mc,
              peerMedian: median,
              deviationScore: Math.round(deviation * 100) / 100,
              excessEntitlements: [],
              uniqueEntitlements: [],
              status: 'open',
              orgId,
            })
          }
        }
      }

      if (newGroups.length > 0) await db.insert(peerGroups).values(newGroups)
      if (newAnomalies.length > 0) await db.insert(peerAnomalies).values(newAnomalies)

      totalGroups += newGroups.length
      totalAnomalies += newAnomalies.length
    }

    return NextResponse.json({
      success: true,
      message: `Peer analysis complete. ${totalGroups} groups, ${totalAnomalies} anomalies.`,
      groups: totalGroups,
      anomalies: totalAnomalies,
    })
  } catch (error) {
    console.error('Peer anomaly detector cron error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

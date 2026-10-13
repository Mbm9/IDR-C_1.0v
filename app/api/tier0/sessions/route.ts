import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { tier0Sessions, identities, resources } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/tier0/sessions — who is accessing Tier 0 infrastructure right now.
 * Returns active logon sessions on Tier 0 hosts (Domain Controllers etc.), joined
 * with the identity and host, anomalous ones first. In the MVP this is fed by demo
 * data — a live feed requires a session/EDR collector.
 */
export const GET = withApiHandler(async (_req: NextRequest, { orgId }) => {
  const rows = await db
    .select({
      id: tier0Sessions.id,
      identityId: tier0Sessions.identityId,
      identityName: identities.displayName,
      identityType: identities.type,
      identitySubType: identities.subType,
      identityRisk: identities.riskScore,
      hostName: resources.name,
      hostType: resources.type,
      logonType: tier0Sessions.logonType,
      privileged: tier0Sessions.privileged,
      sourceHost: tier0Sessions.sourceHost,
      sourceIp: tier0Sessions.sourceIp,
      startedAt: tier0Sessions.startedAt,
      lastSeenAt: tier0Sessions.lastSeenAt,
      anomalous: tier0Sessions.anomalous,
      anomalyReason: tier0Sessions.anomalyReason,
    })
    .from(tier0Sessions)
    .innerJoin(identities, eq(tier0Sessions.identityId, identities.id))
    .innerJoin(resources, eq(tier0Sessions.resourceId, resources.id))
    .where(and(eq(tier0Sessions.orgId, orgId), eq(tier0Sessions.status, 'active')))
    .orderBy(desc(tier0Sessions.anomalous), desc(tier0Sessions.startedAt))

  const summary = {
    active: rows.length,
    anomalous: rows.filter((r) => r.anomalous).length,
    privileged: rows.filter((r) => r.privileged).length,
    hosts: new Set(rows.map((r) => r.hostName)).size,
    identities: new Set(rows.map((r) => r.identityId)).size,
  }

  return NextResponse.json({ sessions: rows, summary })
})

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identityThreats, identities } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId

    const threats = await db
      .select({
        id: identityThreats.id,
        threatType: identityThreats.threatType,
        severity: identityThreats.severity,
        status: identityThreats.status,
        identityId: identityThreats.identityId,
        identityName: identities.displayName,
        identityTier: identities.adTier,
        killChainPhase: identityThreats.killChainPhase,
        confidence: identityThreats.confidence,
        mitreTechniqueIds: identityThreats.mitreTechniqueIds,
        mitreTechniqueName: identityThreats.mitreTechniqueName,
        sourceIp: identityThreats.sourceIp,
        sourceLocation: identityThreats.sourceLocation,
        targetResource: identityThreats.targetResource,
        firstSeenAt: identityThreats.firstSeenAt,
        lastSeenAt: identityThreats.lastSeenAt,
      })
      .from(identityThreats)
      .leftJoin(identities, eq(identityThreats.identityId, identities.id))
      .where(eq(identityThreats.orgId, orgId))
      .orderBy(desc(identityThreats.lastSeenAt))
      .limit(50)

    return NextResponse.json({ threats })
  } catch (err: any) {
    console.error('[Threats Feed] Error:', err)
    return NextResponse.json({ error: 'Failed to load threat feed', details: err.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identities, identityAliases, organizations, actionLog } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { scoreIdentityQuality } from '@/lib/data-quality/scorer'
import { enrichIdentities } from '@/lib/data-quality/enricher'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalScored = 0
    let totalEnriched = 0
    const orgSummaries: any[] = []

    for (const org of allOrgs) {
      // 1. Score all identities for this org
      const orgIdentities = await db
        .select()
        .from(identities)
        .where(eq(identities.orgId, org.id))

      // Fetch all confirmed aliases for the org for accuracy scoring
      const orgAliases = await db
        .select()
        .from(identityAliases)
        .where(and(
          eq(identityAliases.orgId, org.id),
          eq(identityAliases.status, 'confirmed'),
        ))

      // Group aliases by canonical identity
      const aliasesByIdentity = new Map<string, (typeof orgAliases)[number][]>()
      for (const alias of orgAliases) {
        const list = aliasesByIdentity.get(alias.canonicalIdentityId) || []
        list.push(alias)
        aliasesByIdentity.set(alias.canonicalIdentityId, list)
      }

      // Batch update dataQuality for all identities
      for (const identity of orgIdentities) {
        const aliases = aliasesByIdentity.get(identity.id)
        const quality = scoreIdentityQuality(identity, aliases)

        await db.update(identities)
          .set({ dataQuality: quality, updatedAt: new Date() })
          .where(eq(identities.id, identity.id))

        totalScored++
      }

      // 2. Enrich identities with score < 50
      const lowScoreCount = orgIdentities.filter(i => {
        const dq = i.dataQuality as any
        return !dq || !dq.score || dq.score < 50
      }).length

      let enrichReport = null
      if (lowScoreCount > 0) {
        enrichReport = await enrichIdentities(org.id)
        totalEnriched += enrichReport.actions.length
      }

      // 3. Log summary to action_log
      // Use the first identity in the org as actor (system action)
      const systemActor = orgIdentities[0]?.id
      if (systemActor) {
        await db.insert(actionLog).values({
          actionType: 'assess_identity',
          actorIdentityId: systemActor,
          orgId: org.id,
          payload: {
            type: 'data_steward_cron',
            scored: orgIdentities.length,
            lowScoreCount,
            enrichmentActions: enrichReport?.actions.length ?? 0,
            crossSourceFills: enrichReport?.crossSourceFills ?? 0,
            aiInferences: enrichReport?.aiInferences ?? 0,
            normalizations: enrichReport?.normalizations ?? 0,
            decayFlags: enrichReport?.decayFlags ?? 0,
          },
          rationale: `Data steward cron: scored ${orgIdentities.length} identities, enriched ${enrichReport?.actions.length ?? 0} fields`,
          source: 'automated',
        })
      }

      orgSummaries.push({
        orgId: org.id,
        identitiesScored: orgIdentities.length,
        lowScoreCount,
        enrichmentActions: enrichReport?.actions.length ?? 0,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Data steward completed: scored ${totalScored} identities, ${totalEnriched} enrichment actions`,
      totalScored,
      totalEnriched,
      orgs: orgSummaries,
    })
  } catch (error) {
    console.error('Data steward cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Data steward cron failed', error: String(error) },
      { status: 500 }
    )
  }
}

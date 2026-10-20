import { db } from '@/lib/db'
import { identities, identityAliases, groupMemberships, groups, integrationSources } from '@/lib/db/schema'
import { eq, and, isNull, sql, lt } from 'drizzle-orm'
import { DATA_STEWARD } from '@/lib/ai/prompts'
import { generateJSON } from '@/lib/ai/client'

// ── Types ──

export interface EnrichmentAction {
  identityId: string
  field: string
  currentValue: any
  suggestedValue: any
  confidence: number
  method: 'cross_source' | 'ai_inferred' | 'normalized' | 'rule_based'
  reasoning: string
  requiresReview: boolean // true if confidence < 80
}

export interface EnrichmentReport {
  crossSourceFills: number
  aiInferences: number
  normalizations: number
  decayFlags: number
  actions: EnrichmentAction[]
}

// ── Department normalization map ──

const DEPARTMENT_NORMALIZATION: Record<string, string[]> = {
  'Information Technology': ['it', 'i.t.', 'i.t', 'infotech', 'info tech', 'information technology', 'info technology'],
  'Human Resources': ['hr', 'h.r.', 'h.r', 'human resources', 'human resource', 'people ops', 'people operations'],
  'Finance': ['fin', 'finance', 'financial', 'finance dept', 'accounting', 'finance & accounting'],
  'Engineering': ['eng', 'engineering', 'software engineering', 'product engineering'],
  'Marketing': ['mkt', 'marketing', 'mktg', 'digital marketing'],
  'Sales': ['sales', 'business development', 'biz dev'],
  'Operations': ['ops', 'operations', 'it operations', 'infra ops'],
  'Security': ['sec', 'security', 'infosec', 'information security', 'cybersecurity', 'cyber security'],
  'Legal': ['legal', 'legal & compliance', 'compliance'],
  'Executive': ['exec', 'executive', 'c-suite', 'leadership'],
}

function buildNormalizationLookup(): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const [canonical, variants] of Object.entries(DEPARTMENT_NORMALIZATION)) {
    for (const variant of variants) {
      lookup.set(variant.toLowerCase(), canonical)
    }
  }
  return lookup
}

const DEPT_LOOKUP = buildNormalizationLookup()

// ── AI helper ──

async function callDataSteward(prompt: string): Promise<any | null> {
  const result = await generateJSON(
    {
      label: 'data-steward',
      system: DATA_STEWARD,
      prompt,
      temperature: 0.2,
      maxTokens: 2048,
      timeoutMs: 60_000,
    },
    (parsed) => (parsed && typeof parsed === 'object' ? parsed : null),
  )
  return result.ok ? result.data : null
}

// ── Main enrichment pipeline ──

export async function enrichIdentities(orgId: string): Promise<EnrichmentReport> {
  const actions: EnrichmentAction[] = []
  let crossSourceFills = 0
  let aiInferences = 0
  let normalizations = 0
  let decayFlags = 0

  // Fetch all identities for this org
  const allIdentities = await db
    .select()
    .from(identities)
    .where(eq(identities.orgId, orgId))

  // ── Pass 1: Cross-source gap filling ──

  const confirmedAliases = await db
    .select()
    .from(identityAliases)
    .where(and(
      eq(identityAliases.orgId, orgId),
      eq(identityAliases.status, 'confirmed'),
    ))

  // Group aliases by canonical identity
  const aliasesByCanonical = new Map<string, (typeof confirmedAliases)[number][]>()
  for (const alias of confirmedAliases) {
    const list = aliasesByCanonical.get(alias.canonicalIdentityId) || []
    list.push(alias)
    aliasesByCanonical.set(alias.canonicalIdentityId, list)
  }

  const identityMap = new Map(allIdentities.map(i => [i.id, i]))

  for (const [canonicalId, aliases] of aliasesByCanonical) {
    const identity = identityMap.get(canonicalId)
    if (!identity) continue

    for (const alias of aliases) {
      // Fill email from alias source
      if (!identity.email && alias.sourceEmail) {
        actions.push({
          identityId: canonicalId,
          field: 'email',
          currentValue: null,
          suggestedValue: alias.sourceEmail,
          confidence: alias.matchConfidence,
          method: 'cross_source',
          reasoning: `Filled from ${alias.sourceSystem} alias (confidence ${alias.matchConfidence}%)`,
          requiresReview: alias.matchConfidence < 80,
        })
        crossSourceFills++
      }

      // Fill UPN from alias source
      if (!identity.upn && alias.sourceUpn) {
        actions.push({
          identityId: canonicalId,
          field: 'upn',
          currentValue: null,
          suggestedValue: alias.sourceUpn,
          confidence: alias.matchConfidence,
          method: 'cross_source',
          reasoning: `Filled from ${alias.sourceSystem} alias (confidence ${alias.matchConfidence}%)`,
          requiresReview: alias.matchConfidence < 80,
        })
        crossSourceFills++
      }
    }
  }

  // ── Pass 2: AI inference for empty fields ──

  const needsAI = allIdentities.filter(i =>
    !i.department || i.adTier === 'unclassified'
  )

  if (needsAI.length > 0) {
    // Fetch group memberships for context
    const membershipsWithGroups = await db
      .select({
        identityId: groupMemberships.identityId,
        groupName: groups.name,
        groupAdTier: groups.adTier,
        groupType: groups.type,
      })
      .from(groupMemberships)
      .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
      .where(eq(groupMemberships.orgId, orgId))

    const identityGroups = new Map<string, { name: string; adTier: string; type: string }[]>()
    for (const m of membershipsWithGroups) {
      const list = identityGroups.get(m.identityId) || []
      list.push({ name: m.groupName, adTier: m.groupAdTier, type: m.groupType })
      identityGroups.set(m.identityId, list)
    }

    // Process in batches of 10
    for (let i = 0; i < needsAI.length; i += 10) {
      const batch = needsAI.slice(i, i + 10)
      const prompt = JSON.stringify(batch.map(identity => ({
        id: identity.id,
        displayName: identity.displayName,
        email: identity.email,
        upn: identity.upn,
        samAccountName: identity.samAccountName,
        department: identity.department,
        type: identity.type,
        adTier: identity.adTier,
        groups: (identityGroups.get(identity.id) || []).map(g => g.name),
        groupTiers: (identityGroups.get(identity.id) || []).map(g => g.adTier),
      })))

      const aiResult = await callDataSteward(prompt)
      if (!aiResult?.suggestions) continue

      for (const suggestion of aiResult.suggestions) {
        if (!suggestion.identityId || !suggestion.field || suggestion.confidence < 60) continue
        const requiresReview = suggestion.confidence < 90
        actions.push({
          identityId: suggestion.identityId,
          field: suggestion.field,
          currentValue: null,
          suggestedValue: suggestion.suggestedValue,
          confidence: suggestion.confidence,
          method: 'ai_inferred',
          reasoning: suggestion.reasoning || 'AI inference',
          requiresReview,
        })
        aiInferences++

        // Auto-apply if confidence >= 90
        if (!requiresReview) {
          const updateData: any = { [suggestion.field]: suggestion.suggestedValue, updatedAt: new Date() }
          await db.update(identities).set(updateData).where(eq(identities.id, suggestion.identityId))
        }
      }
    }
  }

  // ── Pass 3: Normalization ──

  // Collect all distinct department values for the org
  const deptValues = new Map<string, string[]>() // canonical -> list of identity IDs with non-canonical dept
  for (const identity of allIdentities) {
    if (!identity.department) continue
    const normalized = DEPT_LOOKUP.get(identity.department.toLowerCase().trim())
    if (normalized && normalized !== identity.department) {
      const ids = deptValues.get(`${normalized}::${identity.department}`) || []
      ids.push(identity.id)
      deptValues.set(`${normalized}::${identity.department}`, ids)
    }
  }

  for (const [key, identityIds] of deptValues) {
    const [canonical, original] = key.split('::')
    for (const identityId of identityIds) {
      actions.push({
        identityId,
        field: 'department',
        currentValue: original,
        suggestedValue: canonical,
        confidence: 95,
        method: 'normalized',
        reasoning: `Normalized "${original}" to standard form "${canonical}"`,
        requiresReview: false,
      })
      normalizations++
    }

    // Auto-apply normalizations
    await db.update(identities)
      .set({ department: canonical, updatedAt: new Date() })
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.department, original),
      ))
  }

  // ── Pass 4: Freshness decay ──

  const sources = await db
    .select()
    .from(integrationSources)
    .where(eq(integrationSources.orgId, orgId))

  for (const source of sources) {
    if (!source.lastSyncAt || !source.syncFrequencyMinutes) continue

    const expectedIntervalMs = source.syncFrequencyMinutes * 60 * 1000
    const timeSinceSync = Date.now() - source.lastSyncAt.getTime()
    const missedCycles = Math.floor(timeSinceSync / expectedIntervalMs) - 1

    if (missedCycles <= 0) continue

    // Find identities from this source
    const staleIdentities = allIdentities.filter(
      i => i.sourceSystem === source.type
    )

    for (const identity of staleIdentities) {
      const currentQuality = (identity.dataQuality as any) || {}
      const currentFreshness = currentQuality.freshness ?? 100
      const decayAmount = Math.min(missedCycles * 10, 80) // Cap at 80% reduction
      const newFreshness = Math.max(currentFreshness - decayAmount, 10)

      if (newFreshness < currentFreshness) {
        actions.push({
          identityId: identity.id,
          field: 'freshness',
          currentValue: currentFreshness,
          suggestedValue: newFreshness,
          confidence: 100,
          method: 'rule_based',
          reasoning: `Source "${source.name}" missed ${missedCycles} sync cycle(s). Freshness decayed from ${currentFreshness} to ${newFreshness}.`,
          requiresReview: false,
        })
        decayFlags++

        // Apply freshness decay to dataQuality JSONB
        const updatedQuality = {
          ...currentQuality,
          freshness: newFreshness,
          score: Math.round(
            (currentQuality.completeness ?? 50) * 0.4 +
            newFreshness * 0.3 +
            (currentQuality.accuracy ?? 60) * 0.3
          ),
        }
        await db.update(identities)
          .set({ dataQuality: updatedQuality, updatedAt: new Date() })
          .where(eq(identities.id, identity.id))
      }
    }
  }

  return {
    crossSourceFills,
    aiInferences,
    normalizations,
    decayFlags,
    actions,
  }
}

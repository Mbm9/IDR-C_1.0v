import { db } from '@/lib/db'
import { identities, groupMemberships, groups } from '@/lib/db/schema'
import { eq, and, isNull, lt, sql } from 'drizzle-orm'
import { IDENTITY_CLASSIFIER } from '@/lib/ai/prompts'
import { generateJSON } from '@/lib/ai/client'

// ── Types ──

export interface ClassificationResult {
  identityId: string
  field: 'type' | 'subType' | 'adTier' | 'status'
  currentValue: string | null
  suggestedValue: string
  confidence: number
  method: 'rule' | 'ai'
  reasoning: string
}

// ── Tier 0 group name patterns ──

const TIER_0_GROUPS_EXACT = [
  'domain admins', 'enterprise admins', 'schema admins', 'administrators',
  'account operators', 'backup operators',
]

const TIER_1_PATTERNS = ['server operators', 'server-admin']

// ── NHI prefix patterns ──

const NHI_PREFIXES = ['svc-', 'svc_', 'sa-', 'sa_', 'app-', 'bot-', 'sys-', 'msi-']

// ── Main classifier ──

export async function classifyIdentities(orgId: string): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = []

  // Fetch all identities for this org
  const allIdentities = await db
    .select()
    .from(identities)
    .where(eq(identities.orgId, orgId))

  // Fetch group memberships with group names for tier classification
  const membershipsWithGroups = await db
    .select({
      identityId: groupMemberships.identityId,
      groupName: groups.name,
      groupAdTier: groups.adTier,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(eq(groupMemberships.orgId, orgId))

  // Build identity → group names map
  const identityGroups = new Map<string, string[]>()
  for (const m of membershipsWithGroups) {
    if (!identityGroups.has(m.identityId)) identityGroups.set(m.identityId, [])
    identityGroups.get(m.identityId)!.push(m.groupName.toLowerCase())
  }

  const needsAIClassification: typeof allIdentities = []

  for (const identity of allIdentities) {
    const sam = (identity.samAccountName || '').toLowerCase()
    const groupNames = identityGroups.get(identity.id) || []
    let classified = false

    // ── Rule: NHI detection by naming convention ──
    if (NHI_PREFIXES.some(p => sam.startsWith(p))) {
      if (identity.type !== 'non_human') {
        results.push({
          identityId: identity.id,
          field: 'type',
          currentValue: identity.type,
          suggestedValue: 'non_human',
          confidence: 85,
          method: 'rule',
          reasoning: `samAccountName "${identity.samAccountName}" matches NHI naming convention`,
        })
      }
      if (identity.subType !== 'service_account') {
        results.push({
          identityId: identity.id,
          field: 'subType',
          currentValue: identity.subType,
          suggestedValue: 'service_account',
          confidence: 85,
          method: 'rule',
          reasoning: `samAccountName "${identity.samAccountName}" matches service account prefix`,
        })
      }
      classified = true
    }

    // ── Rule: No email + no manager → likely NHI ──
    if (!identity.email && !identity.managerIdentityId && identity.type !== 'non_human') {
      results.push({
        identityId: identity.id,
        field: 'type',
        currentValue: identity.type,
        suggestedValue: 'non_human',
        confidence: 70,
        method: 'rule',
        reasoning: 'No email address and no manager assigned — likely non-human identity',
      })
      classified = true
    }

    // ── Rule: Tier 0 — member of Domain Admins, Enterprise Admins, etc. ──
    const isTier0Exact = groupNames.some(g => TIER_0_GROUPS_EXACT.includes(g))
    if (isTier0Exact && identity.adTier !== 'tier_0') {
      const matchedGroup = groupNames.find(g => TIER_0_GROUPS_EXACT.includes(g))
      const isTopAdmin = ['domain admins', 'enterprise admins', 'schema admins', 'administrators'].includes(matchedGroup || '')
      results.push({
        identityId: identity.id,
        field: 'adTier',
        currentValue: identity.adTier,
        suggestedValue: 'tier_0',
        confidence: isTopAdmin ? 100 : 95,
        method: 'rule',
        reasoning: `Member of "${matchedGroup}" group — deterministic Tier 0 classification`,
      })
      classified = true
    }

    // ── Rule: Tier 1 — Server Operators or Server-Admin pattern ──
    const isTier1 = groupNames.some(g =>
      TIER_1_PATTERNS.some(p => g.includes(p))
    )
    if (isTier1 && identity.adTier !== 'tier_1' && identity.adTier !== 'tier_0') {
      const matchedGroup = groupNames.find(g => TIER_1_PATTERNS.some(p => g.includes(p)))
      results.push({
        identityId: identity.id,
        field: 'adTier',
        currentValue: identity.adTier,
        suggestedValue: 'tier_1',
        confidence: 90,
        method: 'rule',
        reasoning: `Member of "${matchedGroup}" group — Tier 1 server administration`,
      })
      classified = true
    }

    // ── Rule: Dormant detection ──
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    if (identity.lastLogonAt && identity.lastLogonAt < ninetyDaysAgo &&
      identity.status === 'active') {
      results.push({
        identityId: identity.id,
        field: 'status',
        currentValue: identity.status,
        suggestedValue: 'dormant',
        confidence: 95,
        method: 'rule',
        reasoning: `Last logon was ${Math.floor((Date.now() - identity.lastLogonAt.getTime()) / (24 * 60 * 60 * 1000))} days ago — exceeds 90-day dormancy threshold`,
      })
      classified = true
    }

    // ── Rule: Orphaned NHI detection ──
    if (identity.type === 'non_human' && identity.status !== 'orphaned') {
      // Owner is null
      if (!identity.ownerIdentityId) {
        results.push({
          identityId: identity.id,
          field: 'status',
          currentValue: identity.status,
          suggestedValue: 'orphaned',
          confidence: 90,
          method: 'rule',
          reasoning: 'Non-human identity has no assigned owner',
        })
        classified = true
      } else {
        // Check if owner is disabled
        const owner = allIdentities.find(i => i.id === identity.ownerIdentityId)
        if (owner && (owner.status === 'disabled' || owner.status === 'inactive')) {
          results.push({
            identityId: identity.id,
            field: 'status',
            currentValue: identity.status,
            suggestedValue: 'orphaned',
            confidence: 90,
            method: 'rule',
            reasoning: `Owner "${owner.displayName}" is ${owner.status} — NHI is effectively orphaned`,
          })
          classified = true
        }
      }
    }

    // ── Collect for AI classification if no rules matched and identity needs classification ──
    if (!classified && (identity.adTier === 'unclassified' || !identity.type)) {
      needsAIClassification.push(identity)
    }
  }

  // ── AI classification for remaining unclassified identities ──
  if (needsAIClassification.length > 0) {
    const aiResults = await classifyWithAI(needsAIClassification, identityGroups)
    results.push(...aiResults)
  }

  return results
}

// ── AI classification helper ──

async function classifyWithAI(
  unclassified: (typeof identities.$inferSelect)[],
  identityGroups: Map<string, string[]>
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = []

  // Process in batches of 10
  for (let i = 0; i < unclassified.length; i += 10) {
    const batch = unclassified.slice(i, i + 10)
    const prompt = batch.map(identity => JSON.stringify({
      id: identity.id,
      displayName: identity.displayName,
      samAccountName: identity.samAccountName,
      email: identity.email,
      upn: identity.upn,
      department: identity.department,
      type: identity.type,
      adTier: identity.adTier,
      groups: identityGroups.get(identity.id) || [],
      hasManager: !!identity.managerIdentityId,
      hasOwner: !!identity.ownerIdentityId,
    })).join('\n')

    const aiResponse = await callAIClassifier(prompt)
    if (!aiResponse) continue

    // aiResponse should be an array of classification results
    const classifications = Array.isArray(aiResponse) ? aiResponse : [aiResponse]

    for (const classification of classifications) {
      const identityId = classification.id || batch[0]?.id
      if (!identityId) continue

      if (classification.type?.value) {
        results.push({
          identityId,
          field: 'type',
          currentValue: batch.find(b => b.id === identityId)?.type || null,
          suggestedValue: classification.type.value,
          confidence: classification.type.confidence || 60,
          method: 'ai',
          reasoning: (classification.type.signals || []).join(', '),
        })
      }

      if (classification.subType?.value) {
        results.push({
          identityId,
          field: 'subType',
          currentValue: batch.find(b => b.id === identityId)?.subType || null,
          suggestedValue: classification.subType.value,
          confidence: classification.subType.confidence || 60,
          method: 'ai',
          reasoning: (classification.subType.signals || []).join(', '),
        })
      }

      if (classification.adTier?.value) {
        results.push({
          identityId,
          field: 'adTier',
          currentValue: batch.find(b => b.id === identityId)?.adTier || null,
          suggestedValue: classification.adTier.value,
          confidence: classification.adTier.confidence || 60,
          method: 'ai',
          reasoning: (classification.adTier.signals || []).join(', '),
        })
      }
    }
  }

  return results
}

async function callAIClassifier(prompt: string): Promise<any | null> {
  const result = await generateJSON(
    {
      label: 'identity-classifier',
      system: IDENTITY_CLASSIFIER,
      prompt,
      temperature: 0.2,
      maxTokens: 1024,
      timeoutMs: 60_000,
    },
    (parsed) => (parsed && typeof parsed === 'object' ? parsed : null),
  )
  return result.ok ? result.data : null
}

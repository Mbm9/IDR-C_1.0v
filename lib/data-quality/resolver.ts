import { db } from '@/lib/db'
import { identities, identityAliases } from '@/lib/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { CONFLICT_RESOLVER } from '@/lib/ai/prompts'
import { generateJSON } from '@/lib/ai/client'

// ── Types ──

export interface ResolutionMatch {
  identityA: string // id
  identityB: string // id
  confidence: number
  method: 'deterministic' | 'fuzzy' | 'ai'
  matchedFields: Record<string, boolean>
  reasoning?: string
}

export interface ResolutionReport {
  totalPairs: number
  deterministicMatches: number
  fuzzyMatches: number
  aiMatches: number
  pendingReview: number
  matches: ResolutionMatch[]
}

// ── Levenshtein distance ──

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      )
  return matrix[a.length][b.length]
}

// ── Helpers ──

function emailLocalPart(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  return at > 0 ? email.substring(0, at).toLowerCase() : null
}

function normalizeLocalPart(local: string): string {
  // Remove dots and hyphens for comparison: j.smith -> jsmith, john-smith -> johnsmith
  return local.replace(/[.\-_]/g, '')
}

type IdentityRow = typeof identities.$inferSelect

// ── Main resolver ──

export async function resolveIdentities(
  orgId: string,
  options?: { skipAI?: boolean }
): Promise<ResolutionReport> {
  // Fetch all identities for this org
  const allIdentities = await db
    .select()
    .from(identities)
    .where(eq(identities.orgId, orgId))

  const matches: ResolutionMatch[] = []
  const matchedIds = new Set<string>() // track already-matched identity IDs

  // Group by source system
  const bySource = new Map<string, IdentityRow[]>()
  for (const identity of allIdentities) {
    const source = identity.sourceSystem
    if (!bySource.has(source)) bySource.set(source, [])
    bySource.get(source)!.push(identity)
  }

  const sources = Array.from(bySource.keys())

  // ── Phase 1: Deterministic matching (cross-source exact match) ──
  for (let si = 0; si < sources.length; si++) {
    for (let sj = si + 1; sj < sources.length; sj++) {
      const listA = bySource.get(sources[si])!
      const listB = bySource.get(sources[sj])!

      for (const a of listA) {
        for (const b of listB) {
          const pairKey = [a.id, b.id].sort().join(':')
          if (matchedIds.has(pairKey)) continue

          const matchedFields: Record<string, boolean> = {}
          let confidence = 0

          // Exact email match
          if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
            matchedFields.email = true
            confidence = Math.max(confidence, 98)
          }

          // Exact UPN match
          if (a.upn && b.upn && a.upn.toLowerCase() === b.upn.toLowerCase()) {
            matchedFields.upn = true
            confidence = Math.max(confidence, 97)
          }

          // Exact samAccountName match
          if (a.samAccountName && b.samAccountName &&
            a.samAccountName.toLowerCase() === b.samAccountName.toLowerCase()) {
            matchedFields.samAccountName = true
            confidence = Math.max(confidence, 95)
          }

          if (confidence >= 95) {
            matches.push({
              identityA: a.id,
              identityB: b.id,
              confidence,
              method: 'deterministic',
              matchedFields,
            })
            matchedIds.add(pairKey)
          }
        }
      }
    }
  }

  // ── Phase 2: Fuzzy matching (remaining unmatched cross-source pairs) ──
  const fuzzyMatches: ResolutionMatch[] = []

  for (let si = 0; si < sources.length; si++) {
    for (let sj = si + 1; sj < sources.length; sj++) {
      const listA = bySource.get(sources[si])!
      const listB = bySource.get(sources[sj])!

      for (const a of listA) {
        for (const b of listB) {
          const pairKey = [a.id, b.id].sort().join(':')
          if (matchedIds.has(pairKey)) continue

          const matchedFields: Record<string, boolean> = {}
          let confidence = 0

          // Display name Levenshtein distance
          const nameA = a.displayName.toLowerCase()
          const nameB = b.displayName.toLowerCase()
          const dist = levenshtein(nameA, nameB)

          if (dist < 3 && a.department && b.department &&
            a.department.toLowerCase() === b.department.toLowerCase()) {
            matchedFields.displayName = true
            matchedFields.department = true
            confidence = Math.max(confidence, 85 - dist * 5) // 85 for dist=0, 80 for dist=1, 75 for dist=2
          }

          // Email local part matching (jsmith vs john.smith)
          const localA = emailLocalPart(a.email)
          const localB = emailLocalPart(b.email)
          if (localA && localB) {
            const normA = normalizeLocalPart(localA)
            const normB = normalizeLocalPart(localB)
            if (normA === normB) {
              matchedFields.emailLocalPart = true
              confidence = Math.max(confidence, 80)
            } else if (normA.includes(normB) || normB.includes(normA)) {
              matchedFields.emailLocalPartPartial = true
              confidence = Math.max(confidence, 70)
            }
          }

          if (confidence >= 50) {
            const match: ResolutionMatch = {
              identityA: a.id,
              identityB: b.id,
              confidence,
              method: 'fuzzy',
              matchedFields,
            }
            if (confidence >= 75) {
              matches.push(match)
              matchedIds.add(pairKey)
            } else {
              fuzzyMatches.push(match)
            }
          }
        }
      }
    }
  }

  // ── Phase 3: AI resolution for ambiguous matches (50-70 confidence) ──
  const ambiguous = fuzzyMatches.filter(m => m.confidence >= 50 && m.confidence < 75)
  let aiMatchCount = 0

  if (!options?.skipAI && ambiguous.length > 0) {
    const identityMap = new Map(allIdentities.map(i => [i.id, i]))

    // Process in batches of 5 pairs
    for (let i = 0; i < ambiguous.length; i += 5) {
      const batch = ambiguous.slice(i, i + 5)
      const pairs = batch.map(m => ({
        a: identityMap.get(m.identityA),
        b: identityMap.get(m.identityB),
      }))

      for (let j = 0; j < pairs.length; j++) {
        const { a, b } = pairs[j]
        if (!a || !b) continue

        const aiResult = await callAIResolver(a, b)
        if (aiResult) {
          const match = batch[j]
          match.method = 'ai'
          match.confidence = aiResult.confidence
          match.reasoning = aiResult.reasoning
          if (aiResult.samePerson) {
            matches.push(match)
            matchedIds.add([match.identityA, match.identityB].sort().join(':'))
            aiMatchCount++
          }
        }
      }
    }
  } else {
    // Add ambiguous matches as-is for review
    matches.push(...ambiguous)
  }

  // ── Phase 4: Store results in identity_aliases ──
  const deterministicCount = matches.filter(m => m.method === 'deterministic').length
  const fuzzyCount = matches.filter(m => m.method === 'fuzzy').length
  let pendingCount = 0

  for (const match of matches) {
    const status = match.confidence > 85 ? 'confirmed' as const : 'pending_review' as const
    if (status === 'pending_review') pendingCount++

    const identityMap = new Map(allIdentities.map(i => [i.id, i]))
    const canonical = identityMap.get(match.identityA)
    const alias = identityMap.get(match.identityB)
    if (!canonical || !alias) continue

    await db.insert(identityAliases).values({
      canonicalIdentityId: match.identityA,
      sourceSystem: alias.sourceSystem,
      sourceId: alias.sourceId || alias.id,
      sourceDisplayName: alias.displayName,
      sourceEmail: alias.email,
      sourceUpn: alias.upn,
      matchConfidence: match.confidence,
      matchMethod: match.method,
      matchedFields: match.matchedFields,
      status,
      orgId,
    })
  }

  return {
    totalPairs: matches.length,
    deterministicMatches: deterministicCount,
    fuzzyMatches: fuzzyCount,
    aiMatches: aiMatchCount,
    pendingReview: pendingCount,
    matches,
  }
}

// ── AI conflict resolution helper ──

async function callAIResolver(
  a: IdentityRow,
  b: IdentityRow
): Promise<{ samePerson: boolean; confidence: number; reasoning: string } | null> {
  const prompt = `Identity A: ${JSON.stringify({ displayName: a.displayName, email: a.email, upn: a.upn, samAccountName: a.samAccountName, department: a.department, type: a.type, source: a.sourceSystem })}
Identity B: ${JSON.stringify({ displayName: b.displayName, email: b.email, upn: b.upn, samAccountName: b.samAccountName, department: b.department, type: b.type, source: b.sourceSystem })}`

  const result = await generateJSON(
    {
      label: 'conflict-resolver',
      system: CONFLICT_RESOLVER,
      prompt,
      temperature: 0.2,
      maxTokens: 512,
      timeoutMs: 30_000,
    },
    (parsed) => (parsed && typeof parsed.samePerson === 'boolean'
      ? parsed as { samePerson: boolean; confidence: number; reasoning: string }
      : null),
  )
  return result.ok ? result.data : null
}

import { db } from '@/lib/db'
import { identityAliases, integrationSources } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

// ── Types ──

export interface DataQualityFieldInfo {
  filled: boolean
  source: string | null
  confidence: number
  lastUpdated: string | null
}

export interface DataQuality {
  score: number        // 0-100 weighted average
  completeness: number // 0-100
  freshness: number    // 0-100
  accuracy: number     // 0-100
  fields: Record<string, DataQualityFieldInfo>
}

// ── Expected fields per identity type ──

const HUMAN_EXPECTED_FIELDS = [
  'displayName', 'email', 'upn', 'department', 'managerIdentityId', 'adTier', 'lastLogonAt',
] as const

const NHI_EXPECTED_FIELDS = [
  'displayName', 'upn', 'adTier', 'ownerIdentityId', 'expiryAt',
] as const

// samAccountName counts as alternate for upn
function fieldValue(identity: any, field: string): any {
  if (field === 'upn') return identity.upn || identity.samAccountName
  if (field === 'adTier') return identity.adTier !== 'unclassified' ? identity.adTier : null
  return identity[field]
}

// ── Completeness (40% weight) ──

function computeCompleteness(identity: any): { score: number; fields: Record<string, DataQualityFieldInfo> } {
  const isHuman = identity.type === 'human'
  const expectedFields = isHuman ? HUMAN_EXPECTED_FIELDS : NHI_EXPECTED_FIELDS
  const fields: Record<string, DataQualityFieldInfo> = {}
  let filledCount = 0

  for (const field of expectedFields) {
    const value = fieldValue(identity, field)
    const filled = value != null && value !== '' && value !== undefined
    if (filled) filledCount++

    fields[field] = {
      filled,
      source: identity.sourceSystem || null,
      confidence: filled ? 80 : 0,
      lastUpdated: identity.updatedAt ? new Date(identity.updatedAt).toISOString() : null,
    }
  }

  return {
    score: Math.round((filledCount / expectedFields.length) * 100),
    fields,
  }
}

// ── Freshness (30% weight) ──

function computeFreshness(identity: any): number {
  const updatedAt = identity.updatedAt ? new Date(identity.updatedAt) : null
  if (!updatedAt) return 10 // Never synced / manual

  const ageMs = Date.now() - updatedAt.getTime()
  const ageHours = ageMs / (1000 * 60 * 60)
  const ageDays = ageHours / 24

  if (ageHours < 24) return 100
  if (ageDays < 7) return 80
  if (ageDays < 30) return 50
  return 20
}

// ── Accuracy (30% weight) ──

function computeAccuracy(identity: any, aliases?: any[]): number {
  if (!aliases || aliases.length === 0) return 60 // Single source, can't verify

  // Check agreement on key fields: email, upn, displayName
  let agreementCount = 0
  let checkCount = 0

  for (const alias of aliases) {
    if (alias.sourceEmail && identity.email) {
      checkCount++
      if (alias.sourceEmail.toLowerCase() === identity.email.toLowerCase()) agreementCount++
    }
    if (alias.sourceUpn && identity.upn) {
      checkCount++
      if (alias.sourceUpn.toLowerCase() === identity.upn.toLowerCase()) agreementCount++
    }
    if (alias.sourceDisplayName && identity.displayName) {
      checkCount++
      if (alias.sourceDisplayName.toLowerCase() === identity.displayName.toLowerCase()) agreementCount++
    }
  }

  if (checkCount === 0) return 60 // No overlapping fields to compare
  const ratio = agreementCount / checkCount
  if (ratio >= 0.9) return 100
  if (ratio >= 0.6) return 70
  return 40
}

// ── Main scorer ──

export function scoreIdentityQuality(identity: any, aliases?: any[]): DataQuality {
  const { score: completeness, fields } = computeCompleteness(identity)
  const freshness = computeFreshness(identity)
  const accuracy = computeAccuracy(identity, aliases)

  // Weighted average: completeness 40%, freshness 30%, accuracy 30%
  const score = Math.round(completeness * 0.4 + freshness * 0.3 + accuracy * 0.3)

  return { score, completeness, freshness, accuracy, fields }
}

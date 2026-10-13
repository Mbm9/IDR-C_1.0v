import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identities } from '@/lib/db/schema'
import { eq, sql, or, isNull, lt } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { logAction, unauthorized, forbidden, parseJsonBody } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'
import { z } from 'zod'

// Only descriptive attributes may be filled from a suggestion — never ids, org, risk or tier-violation state.
const SUGGESTIBLE_FIELDS = [
  'displayName', 'email', 'upn', 'samAccountName', 'department',
  'managerIdentityId', 'ownerIdentityId', 'adTier', 'type', 'subType',
  'expiryAt', 'lastLogonAt',
] as const
const DATE_FIELDS = new Set<string>(['expiryAt', 'lastLogonAt'])

const applySuggestionsSchema = z.object({
  suggestions: z.array(z.object({
    identityId: z.string().uuid(),
    field: z.enum(SUGGESTIBLE_FIELDS),
    value: z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]),
    confidence: z.number().min(0).max(100).optional(),
  })).min(1, 'suggestions must be a non-empty array').max(500),
})

// GET: Query identities with low data quality scores, return top 50 with gaps
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

    const orgId = session.user.orgId

    // Identities where dataQuality score < 70 or dataQuality is null
    const lowQuality = await db
      .select()
      .from(identities)
      .where(
        eq(identities.orgId, orgId),
      )
      .limit(200)

    // Filter in JS since JSONB queries vary by driver
    const filtered = lowQuality
      .filter(i => {
        const dq = i.dataQuality as any
        return !dq || !dq.score || dq.score < 70
      })
      .slice(0, 50)
      .map(i => {
        const dq = (i.dataQuality as any) || {}
        const gaps: string[] = []

        // Detect missing fields
        if (!i.email) gaps.push('email')
        if (!i.upn && !i.samAccountName) gaps.push('upn')
        if (!i.department) gaps.push('department')
        if (!i.managerIdentityId && i.type === 'human') gaps.push('managerIdentityId')
        if (i.adTier === 'unclassified') gaps.push('adTier')
        if (i.type === 'non_human' && !i.ownerIdentityId) gaps.push('ownerIdentityId')
        if (i.type === 'non_human' && !i.expiryAt) gaps.push('expiryAt')
        if (!i.lastLogonAt) gaps.push('lastLogonAt')

        return {
          id: i.id,
          displayName: i.displayName,
          type: i.type,
          subType: i.subType,
          sourceSystem: i.sourceSystem,
          dataQuality: dq,
          gaps,
        }
      })

    return NextResponse.json({
      count: filtered.length,
      identities: filtered,
    })
  } catch (err: any) {
    console.error('[Data Quality] Suggestions GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch suggestions', details: err.message }, { status: 500 })
  }
}

// POST: Apply suggestions — update identity fields and quality metadata
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) return forbidden()

    const orgId = session.user.orgId
    const parsed = await parseJsonBody(req, applySuggestionsSchema)
    if (!parsed.ok) return parsed.response
    const { suggestions } = parsed.data

    let applied = 0
    const errors: string[] = []

    for (const suggestion of suggestions) {
      const { identityId, field } = suggestion
      let value: unknown = suggestion.value
      if (DATE_FIELDS.has(field) && typeof value === 'string') {
        const d = new Date(value)
        if (Number.isNaN(d.getTime())) {
          errors.push(`Identity ${identityId}: ${field} must be a valid date`)
          continue
        }
        value = d
      }

      try {
        // Verify identity belongs to this org
        const identity = await db
          .select()
          .from(identities)
          .where(eq(identities.id, identityId))
          .limit(1)

        if (identity.length === 0 || identity[0].orgId !== orgId) {
          errors.push(`Identity ${identityId} not found or not in org`)
          continue
        }

        // Build update: set the field + update dataQuality fields entry
        const currentDQ = (identity[0].dataQuality as any) || { score: 0, completeness: 0, freshness: 50, accuracy: 60, fields: {} }
        const updatedFields = { ...currentDQ.fields }
        updatedFields[field] = {
          filled: true,
          source: 'ai_recommended',
          confidence: suggestion.confidence || 80,
          lastUpdated: new Date().toISOString(),
        }

        const updateData: any = {
          [field]: value,
          updatedAt: new Date(),
          dataQuality: {
            ...currentDQ,
            fields: updatedFields,
          },
        }

        await db.update(identities).set(updateData).where(eq(identities.id, identityId))

        // Log to action_log
        await logAction({
          actionType: 'data_quality_action',
          actorIdentityId: session.user.id,
          orgId,
          targetIdentityId: identityId,
          payload: {
            operation: 'apply_suggestion',
            field,
            previousValue: (identity[0] as any)[field] ?? null,
            newValue: value,
            source: 'data_steward_suggestion',
          },
          rationale: `Applied data quality suggestion: set ${field} to ${String(suggestion.value)}`,
          source: 'ai_recommended',
        })

        applied++
      } catch (e: any) {
        errors.push(`Identity ${identityId}: ${e.message}`)
      }
    }

    return NextResponse.json({
      applied,
      errors,
      total: suggestions.length,
    })
  } catch (err: any) {
    console.error('[Data Quality] Suggestions POST error:', err)
    return NextResponse.json({ error: 'Failed to apply suggestions', details: err.message }, { status: 500 })
  }
}

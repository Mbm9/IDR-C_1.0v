import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identityEvents, identities } from '@/lib/db/schema'
import { eq, or, and, inArray } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { unauthorized, forbidden, badRequest } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'
import { extractApiKey, verifyApiKey } from '@/lib/auth/api-key'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve the caller's organization. Machine clients send
 * `Authorization: Bearer idr_…` (an API key created in Settings → API keys)
 * and act with analyst-equivalent permission for ingest; otherwise a
 * dashboard session with at least the analyst role is required. A request
 * that presents an API key is never silently downgraded to session auth.
 */
async function resolveCaller(req: NextRequest): Promise<{ orgId: string } | Response> {
  if (extractApiKey(req.headers)) {
    const key = await verifyApiKey(req)
    if (!key) return unauthorized()
    if (!hasRole(key.appRole, 'analyst')) return forbidden()
    return { orgId: key.orgId }
  }
  if (/^Bearer\s+idr_/i.test(req.headers.get('authorization') ?? '')) return unauthorized()

  const session = await auth()
  if (!session?.user?.orgId) return unauthorized()
  if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()
  return { orgId: session.user.orgId }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await resolveCaller(req)
    if (caller instanceof Response) return caller

    const orgId = caller.orgId
    const body = await req.json().catch(() => null)

    if (!body || !Array.isArray(body.events)) {
      return badRequest('Expected { events: [...] } array')
    }

    const events = body.events as any[]
    if (events.length === 0) {
      return NextResponse.json({ inserted: 0 })
    }

    if (events.length > 1000) {
      return badRequest('Maximum 1000 events per batch')
    }

    // Client-supplied identity IDs are only honoured when they belong to the
    // caller's organization; anything else is treated as unresolved.
    const suppliedIds = Array.from(new Set(
      events.map((e) => e?.identityId).filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
    ))
    const ownedIds = new Set<string>()
    if (suppliedIds.length > 0) {
      const owned = await db
        .select({ id: identities.id })
        .from(identities)
        .where(and(eq(identities.orgId, orgId), inArray(identities.id, suppliedIds)))
      for (const row of owned) ownedIds.add(row.id)
    }

    // Resolve identities by UPN/email/samAccountName
    const resolvedEvents: (typeof identityEvents.$inferInsert)[] = []
    let skipped = 0

    for (const event of events) {
      if (!event?.eventType || !event.source || !event.eventTimestamp) { skipped++; continue }

      // One bad timestamp must not fail the whole batch.
      const eventTimestamp = new Date(event.eventTimestamp)
      if (Number.isNaN(eventTimestamp.getTime())) { skipped++; continue }

      let identityId: string | undefined =
        typeof event.identityId === 'string' && ownedIds.has(event.identityId) ? event.identityId : undefined

      // If no (owned) identityId provided, try to resolve from parsed fields
      if (!identityId) {
        const upn = event.parsedFields?.upn || event.upn
        const email = event.parsedFields?.email || event.email
        const sam = event.parsedFields?.samAccountName || event.samAccountName

        if (upn || email || sam) {
          const conditions = []
          if (upn) conditions.push(eq(identities.upn, upn))
          if (email) conditions.push(eq(identities.email, email))
          if (sam) conditions.push(eq(identities.samAccountName, sam))

          const [found] = await db
            .select({ id: identities.id })
            .from(identities)
            .where(and(eq(identities.orgId, orgId), or(...conditions)))
            .limit(1)

          identityId = found?.id
        }
      }

      resolvedEvents.push({
        eventType: event.eventType,
        source: event.source,
        identityId: identityId || null,
        rawEvent: event.rawEvent || event,
        parsedFields: event.parsedFields || {
          ipAddress: event.ipAddress,
          location: event.location,
          userAgent: event.userAgent,
          result: event.result,
          mfaMethod: event.mfaMethod,
          riskLevel: event.riskLevel,
          targetResource: event.targetResource,
          eventId: event.eventId,
          sessionId: event.sessionId,
        },
        eventTimestamp,
        orgId,
      })
    }

    if (resolvedEvents.length === 0) {
      return badRequest('No valid events to insert')
    }

    // Batch insert
    const inserted = await db.insert(identityEvents).values(resolvedEvents).returning({ id: identityEvents.id })

    return NextResponse.json({
      inserted: inserted.length,
      resolved: resolvedEvents.filter(e => e.identityId).length,
      unresolved: resolvedEvents.filter(e => !e.identityId).length,
      skipped,
    })
  } catch (err: any) {
    console.error('[Events Ingest] Error:', err)
    return NextResponse.json({ error: 'Event ingestion failed' }, { status: 500 })
  }
}

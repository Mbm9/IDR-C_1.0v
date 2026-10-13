import { z } from 'zod'
import { db } from '@/lib/db'
import { actionLog } from '@/lib/db/schema'

export async function logAction(params: {
  actionType: typeof actionLog.$inferInsert['actionType']
  actorIdentityId: string
  orgId: string
  targetIdentityId?: string | null
  targetEntitlementId?: string | null
  targetPolicyViolationId?: string | null
  payload?: any
  rationale?: string | null
  source?: typeof actionLog.$inferInsert['source']
}) {
  return db.insert(actionLog).values({
    actionType: params.actionType,
    actorIdentityId: params.actorIdentityId,
    orgId: params.orgId,
    targetIdentityId: params.targetIdentityId ?? undefined,
    targetEntitlementId: params.targetEntitlementId ?? undefined,
    targetPolicyViolationId: params.targetPolicyViolationId ?? undefined,
    payload: params.payload ?? {},
    rationale: params.rationale ?? undefined,
    source: params.source ?? 'manual',
  }).returning()
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return Response.json({ error: 'Forbidden' }, { status: 403 })
}

export function badRequest(message: string, details?: any) {
  return Response.json({ error: message, details }, { status: 400 })
}

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response }

/**
 * Read and validate a JSON request body at the API boundary.
 * - Malformed JSON → 400 "Malformed JSON body".
 * - An empty body is treated as `{}` so the schema reports the missing fields.
 * - Schema failure → 400 "Invalid input" with `details` = zod `flatten()` ({ formErrors, fieldErrors }).
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<ParsedBody<z.infer<S>>> {
  let raw: unknown = {}
  try {
    const text = await req.text()
    if (text.trim()) raw = JSON.parse(text)
  } catch {
    return { ok: false, response: badRequest('Malformed JSON body') }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, response: badRequest('Invalid input', parsed.error.flatten()) }
  }
  return { ok: true, data: parsed.data }
}

/** Keys of a partial-update body that were actually provided (for audit payloads). */
export function changedKeys(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => body[k] !== undefined)
}

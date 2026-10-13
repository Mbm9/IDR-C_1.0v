import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { apiKeys, subscriptions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { logAction } from '@/lib/actions/helpers'
import { hasRole } from '@/lib/utils/rbac'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import type { AppRole } from '@/lib/utils/rbac'
import { z } from 'zod'
import { API_KEY_SCHEME, apiKeyPrefix } from '@/lib/auth/api-key-token'

const createKeySchema = z.object({
  label: z.string().trim().min(1, 'Label required').max(100),
  /** Optional lifetime; keys without one stay valid until revoked. */
  expiresInDays: z.number().int().min(1).max(730).optional(),
})

const revokeKeySchema = z.object({
  keyId: z.string().uuid('keyId required'),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const keys = await db.select({
    id: apiKeys.id,
    label: apiKeys.label,
    keyPrefix: apiKeys.keyPrefix,
    lastUsedAt: apiKeys.lastUsedAt,
    revoked: apiKeys.revoked,
    expiresAt: apiKeys.expiresAt,
    createdAt: apiKeys.createdAt,
  }).from(apiKeys)
    .where(and(eq(apiKeys.orgId, session.user.orgId), eq(apiKeys.revoked, false)))

  return NextResponse.json({ keys })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'admin'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Check subscription allows API access
  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.orgId, session.user.orgId)).limit(1)
  if (!sub?.apiAccess) {
    return NextResponse.json({ error: 'API access requires Professional or Enterprise tier' }, { status: 403 })
  }

  const parsed = createKeySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { label, expiresInDays } = parsed.data

  const rawKey = `${API_KEY_SCHEME}${crypto.randomBytes(32).toString('hex')}`
  const keyPrefix = apiKeyPrefix(rawKey)
  const keyHash = await bcrypt.hash(rawKey, 10)
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null

  const [created] = await db.insert(apiKeys).values({
    label,
    keyPrefix,
    keyHash,
    orgId: session.user.orgId,
    createdBy: session.user.id,
    expiresAt,
  }).returning({ id: apiKeys.id })

  await logAction({
    actionType: 'manage_api_key',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    payload: { operation: 'create', keyId: created.id, label, keyPrefix, expiresAt },
  })

  // Return the full key only on creation — it won't be shown again
  return NextResponse.json({ key: rawKey, prefix: keyPrefix, expiresAt })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'admin'))
    return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 })

  const parsed = revokeKeySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'keyId required' }, { status: 400 })
  const { keyId } = parsed.data
  const revoked = await db.update(apiKeys)
    .set({ revoked: true })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, session.user.orgId)))
    .returning({ id: apiKeys.id })

  if (revoked.length > 0) {
    await logAction({
      actionType: 'manage_api_key',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      payload: { operation: 'revoke', keyId },
    })
  }

  return NextResponse.json({ success: true })
}

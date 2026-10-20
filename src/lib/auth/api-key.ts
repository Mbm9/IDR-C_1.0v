import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import type { AppRole } from '@/lib/utils/rbac'
import { apiKeyPrefix, extractApiKey } from '@/lib/auth/api-key-token'

export { API_KEY_PATHS, isApiKeyPath, extractApiKey, apiKeyPrefix } from '@/lib/auth/api-key-token'

/**
 * Role an API-key caller acts with. Keys are only accepted on the allow-listed
 * machine endpoints (see API_KEY_PATHS), so this never grants access to the
 * dashboard API.
 */
export const API_KEY_ROLE: AppRole = 'analyst'

/** last_used_at is written at most once per this interval per key. */
export const LAST_USED_THROTTLE_MS = 60_000

export interface ApiKeyPrincipal {
  keyId: string
  keyPrefix: string
  label: string
  orgId: string
  /** users.id of the admin who created the key */
  createdBy: string
  appRole: AppRole
}

/**
 * Verify an `Authorization: Bearer idr_…` header (Node runtime only).
 *
 * Looks the key up by its 12-character prefix, bcrypt-compares the full key
 * against key_hash, and rejects revoked or expired keys. On success the
 * caller's organization comes from the key row, and last_used_at is updated
 * (throttled). Returns null when the request carries no valid key.
 */
export async function verifyApiKey(request: Pick<Request, 'headers'>): Promise<ApiKeyPrincipal | null> {
  const rawKey = extractApiKey(request.headers)
  if (!rawKey) return null
  const keyPrefix = apiKeyPrefix(rawKey)

  const candidates = await db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      keyPrefix: apiKeys.keyPrefix,
      keyHash: apiKeys.keyHash,
      orgId: apiKeys.orgId,
      createdBy: apiKeys.createdBy,
      revoked: apiKeys.revoked,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, keyPrefix))
    .limit(10)

  const now = Date.now()
  for (const key of candidates) {
    if (key.revoked) continue
    if (key.expiresAt && new Date(key.expiresAt).getTime() <= now) continue
    if (!(await bcrypt.compare(rawKey, key.keyHash))) continue

    const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0
    if (now - lastUsed > LAST_USED_THROTTLE_MS) {
      try {
        await db.update(apiKeys).set({ lastUsedAt: new Date(now) }).where(eq(apiKeys.id, key.id))
      } catch (err) {
        // Usage tracking must not fail an authenticated request.
        console.error('[api-key] failed to update last_used_at:', (err as Error).message)
      }
    }

    return {
      keyId: key.id,
      keyPrefix: key.keyPrefix,
      label: key.label,
      orgId: key.orgId,
      createdBy: key.createdBy,
      appRole: API_KEY_ROLE,
    }
  }
  return null
}

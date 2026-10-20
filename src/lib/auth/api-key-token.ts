/**
 * Edge-safe helpers for API-key bearer tokens (no database or bcrypt imports),
 * shared by middleware.ts and the Node-runtime verifier in lib/auth/api-key.ts.
 *
 * Key format: `idr_` + 64 hex chars. The first 12 characters (`idr_` + 8 hex)
 * are stored in api_keys.key_prefix for lookup and display; the full key is
 * only ever stored as a bcrypt hash.
 */

export const API_KEY_SCHEME = 'idr_'
export const API_KEY_PREFIX_LENGTH = 12
const RAW_KEY_RE = /^idr_[0-9a-f]{64}$/

/**
 * Routes that accept API-key authentication. Middleware lets a request that
 * carries an `idr_` bearer token through without a session ONLY for these
 * paths; the route handler then verifies the key with verifyApiKey().
 */
export const API_KEY_PATHS: readonly string[] = ['/api/events/ingest']

export function isApiKeyPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return API_KEY_PATHS.includes(normalized)
}

/**
 * The raw `idr_…` token from `Authorization: Bearer idr_…`, or null when the
 * header is missing, uses another scheme, or the token is malformed.
 */
export function extractApiKey(headers: Pick<Headers, 'get'>): string | null {
  const header = headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  if (!match) return null
  const token = match[1]
  return RAW_KEY_RE.test(token) ? token : null
}

/** Display/lookup prefix of a raw key (`idr_` + 8 hex). */
export function apiKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, API_KEY_PREFIX_LENGTH)
}

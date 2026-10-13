/**
 * In-memory rate limiter for Next.js API routes.
 *
 * Buckets (per minute, configurable via RATE_LIMIT_*_PER_MIN):
 *   - API routes:          300 per user (per IP when anonymous)
 *   - Credential POSTs:     30 per IP
 *   - AI routes:             5 per user
 *
 * Returns 429 with Retry-After header when limit is exceeded.
 * Uses a sliding window counter stored in a Map, with automatic
 * cleanup of stale entries every 60 seconds.
 */

interface RateLimitEntry {
  count: number
  resetAt: number // epoch ms
}

// Keyed by `${ip}:${bucket}`
const store = new Map<string, RateLimitEntry>()

// Periodic cleanup of expired entries
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key)
    }
  }
}

export type RateLimitBucket = 'api' | 'auth' | 'ai'

/** Positive integer from an env var, else the default. */
function envLimit(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Per minute. A dashboard page issues ~10 API calls (plus React Query
// refetches), so `api` must allow brisk navigation; `auth` guards credential
// submissions only. Override with RATE_LIMIT_{API,AUTH,AI}_PER_MIN.
const LIMITS: Record<RateLimitBucket, { maxRequests: number; windowMs: number }> = {
  api: { maxRequests: envLimit('RATE_LIMIT_API_PER_MIN', 300), windowMs: 60_000 },
  auth: { maxRequests: envLimit('RATE_LIMIT_AUTH_PER_MIN', 30), windowMs: 60_000 },
  ai: { maxRequests: envLimit('RATE_LIMIT_AI_PER_MIN', 5), windowMs: 60_000 },
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

/**
 * Check whether a request from `ip` in the given `bucket` is allowed.
 */
export function checkRateLimit(ip: string, bucket: RateLimitBucket): RateLimitResult {
  cleanup()

  const { maxRequests, windowMs } = LIMITS[bucket]
  const key = `${ip}:${bucket}`
  const now = Date.now()

  let entry = store.get(key)

  // Window has expired or first request — start fresh
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs }
    store.set(key, entry)
    return { allowed: true, limit: maxRequests, remaining: maxRequests - 1, retryAfterSeconds: 0 }
  }

  // Within current window
  entry.count += 1

  if (entry.count > maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, limit: maxRequests, remaining: 0, retryAfterSeconds }
  }

  return {
    allowed: true,
    limit: maxRequests,
    remaining: maxRequests - entry.count,
    retryAfterSeconds: 0,
  }
}

/**
 * Resolve the client IP used as the rate-limit key.
 *
 * Caddy sets X-Real-IP from the TCP peer address and overwrites
 * X-Forwarded-For, so X-Real-IP is preferred. When only X-Forwarded-For is
 * present the right-most entry is used: it is the one appended by the nearest
 * proxy, whereas left-most entries are supplied by the client and can be
 * rotated per request to dodge the limiter.
 */
export function clientIp(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }
  return '127.0.0.1'
}

/**
 * Determine the rate-limit bucket for a request.
 *
 * Only credential submissions (POST to /api/auth/*: sign-in callback, signup,
 * sign-out) use the strict `auth` bucket. Session/CSRF reads are issued by the
 * client on every page load and focus, so counting them against the login
 * limit throttled normal navigation after ~25 page views a minute. Likewise
 * only non-GET requests under /api/ai/ (model calls) use the `ai` bucket.
 */
export function getBucket(pathname: string, method = 'GET'): RateLimitBucket | null {
  // Only model calls are expensive; listing chat sessions or plans is a cheap read.
  if (pathname.startsWith('/api/ai/')) return method === 'GET' ? 'api' : 'ai'
  if (pathname.startsWith('/api/auth/')) return method === 'POST' ? 'auth' : 'api'
  if (pathname.startsWith('/api/')) return 'api'
  return null
}

/**
 * Rate-limit key: authenticated traffic is limited per user, so colleagues
 * behind one NAT address do not share a budget; anonymous traffic and login
 * attempts are limited per client IP.
 */
export function rateLimitKey(bucket: RateLimitBucket, headers: Headers, userId?: string | null): string {
  if (userId && bucket !== 'auth') return `user:${userId}`
  return `ip:${clientIp(headers)}`
}

/**
 * Build a 429 Response with standard rate-limit headers.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(result.retryAfterSeconds),
      },
    }
  )
}

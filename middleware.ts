import { auth } from '@/lib/auth/config'
import { NextResponse } from 'next/server'
import { checkRateLimit, getBucket, rateLimitKey, rateLimitResponse } from '@/lib/middleware/rate-limit'
import {
  applySecurityHeaders,
  handlePreflight,
  validateContentType,
  validateRequestSize,
  handleCors,
} from '@/lib/middleware/security'
import { apiKeyPrefix, extractApiKey, isApiKeyPath } from '@/lib/auth/api-key-token'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  // Machine clients (SIEM pushes) authenticate with `Authorization: Bearer
  // idr_…` on allow-listed paths only. The key is verified by the route handler
  // (lib/auth/api-key.ts, Node runtime); middleware only lets it through.
  const apiKey = isApiKeyPath(pathname) ? extractApiKey(req.headers) : null

  // Handle CORS preflight
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  // ------------------------------------------------------------------
  // Rate limiting (API routes only)
  // ------------------------------------------------------------------
  const bucket = getBucket(pathname, req.method)
  if (bucket) {
    const key = rateLimitKey(bucket, req.headers, req.auth?.user?.id, apiKey ? apiKeyPrefix(apiKey) : null)

    const result = checkRateLimit(key, bucket)
    if (!result.allowed) {
      return rateLimitResponse(result)
    }
    // API-key traffic is also limited per client IP: otherwise a caller could
    // rotate random key prefixes to get a fresh per-key budget each request.
    if (apiKey) {
      const ipResult = checkRateLimit(rateLimitKey(bucket, req.headers), bucket)
      if (!ipResult.allowed) return rateLimitResponse(ipResult)
    }
  }

  // ------------------------------------------------------------------
  // Security checks for API mutation requests
  // ------------------------------------------------------------------
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    const sizeError = validateRequestSize(req)
    if (sizeError) return sizeError

    const contentTypeError = validateContentType(req)
    if (contentTypeError) return contentTypeError
  }

  // ------------------------------------------------------------------
  // Authentication guards
  // ------------------------------------------------------------------
  const isAuthApi = pathname.startsWith('/api/auth')
  const isPublicApi = pathname === '/api/health'
  // Cron jobs are called by an external scheduler with
  // `Authorization: Bearer $CRON_SECRET` and no session cookie; each route
  // verifies the secret itself via verifyCronSecret().
  const isCronApi = pathname.startsWith('/api/cron/')
  // `apiKey` is only set for API_KEY_PATHS; the route rejects invalid keys.

  if (isAuthApi || isPublicApi || isCronApi || apiKey) {
    const response = NextResponse.next()
    return applySecurityHeaders(handleCors(req, response))
  }

  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) && !isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl)
    loginUrl.searchParams.set('callbackUrl', pathname + req.nextUrl.search)
    return Response.redirect(loginUrl)
  }

  if (pathname.startsWith('/api/') && !isLoggedIn) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ------------------------------------------------------------------
  // Apply security headers + CORS to all matched routes
  // ------------------------------------------------------------------
  const response = NextResponse.next()
  return applySecurityHeaders(handleCors(req, response))
})

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/api/:path*'],
}

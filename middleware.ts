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

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Handle CORS preflight
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  // ------------------------------------------------------------------
  // Rate limiting (API routes only)
  // ------------------------------------------------------------------
  const bucket = getBucket(pathname, req.method)
  if (bucket) {
    const key = rateLimitKey(bucket, req.headers, req.auth?.user?.id)

    const result = checkRateLimit(key, bucket)
    if (!result.allowed) {
      return rateLimitResponse(result)
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

  if (isAuthApi || isPublicApi || isCronApi) {
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

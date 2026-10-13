/**
 * Security middleware utilities for Next.js.
 *
 * Provides:
 *   - Input sanitization (strip HTML tags from string values)
 *   - Request body size validation (1 MB limit)
 *   - CORS configuration
 *   - Content-Type validation for mutation requests
 *   - Security response headers
 */

import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BODY_SIZE = 1 * 1024 * 1024 // 1 MB

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
]

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// ---------------------------------------------------------------------------
// Input Sanitization
// ---------------------------------------------------------------------------

/** Strip HTML tags from a string. */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}

/** Recursively sanitize all string values in a JSON-compatible object. */
export function sanitizeInput(data: unknown): unknown {
  if (typeof data === 'string') return stripHtml(data)
  if (Array.isArray(data)) return data.map(sanitizeInput)
  if (data !== null && typeof data === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[stripHtml(key)] = sanitizeInput(value)
    }
    return result
  }
  return data
}

// ---------------------------------------------------------------------------
// Content-Type Validation
// ---------------------------------------------------------------------------

/** True when the request carries a body (non-zero length or chunked). */
function hasBody(request: Pick<NextRequest, 'headers'>): boolean {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) return parseInt(contentLength, 10) > 0
  return request.headers.has('transfer-encoding')
}

/**
 * For mutation requests (POST/PUT/PATCH/DELETE) that carry a body, verify the
 * Content-Type header is application/json or multipart/form-data. Body-less
 * mutations (e.g. "mark all read", DELETE by id) send no Content-Type and are
 * allowed. Returns an error Response or null if valid.
 */
export function validateContentType(request: Pick<NextRequest, 'method' | 'headers'>): Response | null {
  if (!MUTATION_METHODS.has(request.method)) return null
  if (!hasBody(request)) return null

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
    return new Response(
      JSON.stringify({ error: 'Content-Type must be application/json' }),
      { status: 415, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Request Size Limit
// ---------------------------------------------------------------------------

/**
 * Reject requests whose Content-Length exceeds MAX_BODY_SIZE.
 * Returns an error Response or null if within limits.
 */
export function validateRequestSize(request: Pick<NextRequest, 'headers'>): Response | null {
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return new Response(
      JSON.stringify({ error: 'Request body too large. Maximum size is 1 MB.' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/**
 * Apply CORS headers to a response. For preflight (OPTIONS) requests,
 * returns a 204 response directly.
 */
export function handleCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin') || ''

  if (ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Max-Age', '86400')
  response.headers.set('Access-Control-Allow-Credentials', 'true')

  return response
}

/**
 * Handle OPTIONS preflight requests.
 */
export function handlePreflight(request: NextRequest): Response | null {
  if (request.method !== 'OPTIONS') return null

  const origin = request.headers.get('origin') || ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
  }

  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return new Response(null, { status: 204, headers })
}

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------

/** Append security headers to a NextResponse. */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  )

  return response
}

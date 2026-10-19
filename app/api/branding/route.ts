import { NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { getPublicBranding } from '@/lib/branding'

// Reads the database per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/branding — public branding for the sign-in and sign-up pages.
 * Returns the organization's name and logo only on a single-organization
 * install; otherwise the product default (both null).
 */
export const GET = withApiHandler(async () => {
  const branding = await getPublicBranding()
  return NextResponse.json(branding, { headers: { 'Cache-Control': 'public, max-age=60' } })
}, { public: true })

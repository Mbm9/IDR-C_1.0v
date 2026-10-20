import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/preferences
 * Returns the current user's preferences.
 */
export const GET = withApiHandler(async (req: NextRequest, { session }) => {
  const [user] = await db.select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  return NextResponse.json({ preferences: user?.preferences || {} })
})

/**
 * PUT /api/settings/preferences
 * Deep-merges partial preferences into the user's existing preferences.
 * Body: partial preferences object (any subset of keys)
 */
export const PUT = withApiHandler(async (req: NextRequest, { session, log }) => {
  const updates = await req.json()

  // Fetch current preferences
  const [user] = await db.select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  const current = (user?.preferences || {}) as Record<string, any>

  // Deep merge (one level deep)
  const merged = { ...current }
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof current[key] === 'object') {
      merged[key] = { ...current[key], ...value }
    } else {
      merged[key] = value
    }
  }

  await db.update(users)
    .set({ preferences: merged })
    .where(eq(users.id, session.user.id))

  log.info('Preferences updated', { keys: Object.keys(updates) })

  return NextResponse.json({ preferences: merged })
})

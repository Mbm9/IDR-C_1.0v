import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { activeSessions } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/sessions
 * List active sessions for the current user.
 */
export const GET = withApiHandler(async (req: NextRequest, { session, log }) => {
  const sessions = await db.select()
    .from(activeSessions)
    .where(and(
      eq(activeSessions.userId, session.user.id),
      isNull(activeSessions.revokedAt),
    ))
    .orderBy(activeSessions.lastActiveAt)

  return NextResponse.json({ sessions })
})

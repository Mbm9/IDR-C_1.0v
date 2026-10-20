import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { activeSessions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * DELETE /api/settings/sessions/[id]
 * Revoke a session by setting revokedAt. The JWT callback checks this
 * and will reject tokens with a revoked JTI.
 */
export const DELETE = withApiHandler(async (req: NextRequest, { session, log }) => {
  const id = req.nextUrl.pathname.split('/').pop()!

  const [target] = await db.select()
    .from(activeSessions)
    .where(and(
      eq(activeSessions.id, id),
      eq(activeSessions.userId, session.user.id),
    ))
    .limit(1)

  if (!target) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  await db.update(activeSessions)
    .set({ revokedAt: new Date() })
    .where(eq(activeSessions.id, id))

  log.info('Session revoked', { sessionId: id })

  return NextResponse.json({ success: true })
})

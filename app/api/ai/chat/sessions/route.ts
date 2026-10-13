import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { chatSessions } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const userId = session.user.id
    const orgId = session.user.orgId

    const sessions = await db.select({
      id: chatSessions.id,
      title: chatSessions.title,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
    })
      .from(chatSessions)
      .where(and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.orgId, orgId),
      ))
      .orderBy(desc(chatSessions.updatedAt))
      .limit(50)

    return NextResponse.json(sessions)
  } catch (err: any) {
    console.error('[AI Chat Sessions] Error:', err)
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
  }
}

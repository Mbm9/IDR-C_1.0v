import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { chatSessions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const { id } = await params
    const userId = session.user.id
    const orgId = session.user.orgId

    const [chatSession] = await db.select()
      .from(chatSessions)
      .where(and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, userId),
        eq(chatSessions.orgId, orgId),
      ))
      .limit(1)

    if (!chatSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json(chatSession)
  } catch (err: any) {
    console.error('[AI Chat Session] Error:', err)
    return NextResponse.json({ error: 'Failed to load session' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const { id } = await params
    const userId = session.user.id
    const orgId = session.user.orgId

    const [deleted] = await db.delete(chatSessions)
      .where(and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, userId),
        eq(chatSessions.orgId, orgId),
      ))
      .returning({ id: chatSessions.id })

    if (!deleted) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[AI Chat Session Delete] Error:', err)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}

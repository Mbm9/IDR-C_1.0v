import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { chatSessions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import { processChat } from '@/lib/ai/chat-engine'
import { unauthorized, forbidden } from '@/lib/actions/helpers'
import type { AppRole } from '@/lib/utils/rbac'
import type { ChatMessage } from '@/lib/db/schema/chat-sessions'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'viewer')) return forbidden()

    const orgId = session.user.orgId
    const userId = session.user.id
    const body = await req.json().catch(() => ({}))
    const { message, sessionId } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get or create chat session
    let chatSession: any
    if (sessionId) {
      const [existing] = await db.select()
        .from(chatSessions)
        .where(and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.userId, userId),
          eq(chatSessions.orgId, orgId),
        ))
        .limit(1)

      if (!existing) {
        return NextResponse.json({ error: 'Chat session not found' }, { status: 404 })
      }
      chatSession = existing
    } else {
      // Create new session with first message as title
      const title = message.slice(0, 80) + (message.length > 80 ? '...' : '')
      const [created] = await db.insert(chatSessions).values({
        userId,
        orgId,
        title,
        messages: [],
      }).returning()
      chatSession = created
    }

    // Process the message
    const response = await processChat(message, orgId, userId)

    // Build updated messages array
    const existingMessages = (chatSession.messages as ChatMessage[]) || []
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response.answer,
      timestamp: new Date().toISOString(),
      metadata: {
        queryResults: response.data ?? undefined,
        suggestedActions: response.suggestedActions ?? undefined,
        generatedBy: response.generatedBy,
        model: response.model,
      },
    }

    const updatedMessages = [...existingMessages, userMessage, assistantMessage]

    // Update session
    await db.update(chatSessions)
      .set({
        messages: updatedMessages,
        updatedAt: new Date(),
      })
      .where(eq(chatSessions.id, chatSession.id))

    return NextResponse.json({
      sessionId: chatSession.id,
      response,
    })
  } catch (err: any) {
    console.error('[AI Chat] Error:', err)
    return NextResponse.json({ error: 'Chat failed', details: err.message }, { status: 500 })
  }
}

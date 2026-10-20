import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('New Chat'),
  messages: jsonb('messages').notNull().default([]),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_chat_sessions_user_id').on(table.userId),
  index('idx_chat_sessions_org_id').on(table.orgId),
  index('idx_chat_sessions_updated_at').on(table.updatedAt),
])

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: {
    queryResults?: any
    suggestedActions?: any
    /** 'ai' when a model produced the answer, 'deterministic' for the rule-based fallback */
    generatedBy?: 'ai' | 'deterministic'
    model?: string
  }
}

export type ChatSession = typeof chatSessions.$inferSelect
export type NewChatSession = typeof chatSessions.$inferInsert

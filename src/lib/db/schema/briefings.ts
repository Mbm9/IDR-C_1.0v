import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './organizations'

export const briefings = pgTable('briefings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  metrics: jsonb('metrics'), // snapshot of key metrics at generation time
  delta: jsonb('delta'), // 24-hour changes
  narrative: text('narrative'), // AI-generated briefing text
  highlights: jsonb('highlights'), // array of { type: 'positive'|'negative'|'action', text: string }
  deliveredVia: text('delivered_via').array().default([]), // ['in_app', 'email', 'webhook']
}, (table) => [
  index('idx_briefings_org_id').on(table.orgId),
  index('idx_briefings_generated_at').on(table.generatedAt),
])

export const briefingsRelations = relations(briefings, ({ one }) => ({
  organization: one(organizations, {
    fields: [briefings.orgId],
    references: [organizations.id],
  }),
}))

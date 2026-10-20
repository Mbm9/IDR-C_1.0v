import { pgTable, uuid, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret'),
  events: text('events').array().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  lastStatus: integer('last_status'),
  failureCount: integer('failure_count').notNull().default(0),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_webhook_endpoints_org_id').on(table.orgId),
  index('idx_webhook_endpoints_enabled').on(table.enabled),
])

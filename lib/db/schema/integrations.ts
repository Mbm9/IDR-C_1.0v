import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { integrationTypeEnum, syncStatusEnum } from './enums'
import { organizations } from './organizations'

export const integrationSources = pgTable('integration_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: integrationTypeEnum('type').notNull(),
  config: jsonb('config').default({}),
  syncStatus: syncStatusEnum('sync_status').notNull().default('disconnected'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncRecordCount: integer('last_sync_record_count').default(0),
  /** Short, credential-free reason for the last failed sync; null after a successful sync. */
  lastSyncError: text('last_sync_error'),
  syncFrequencyMinutes: integer('sync_frequency_minutes').notNull().default(360),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_integrations_org_id').on(table.orgId),
  index('idx_integrations_sync_status').on(table.syncStatus),
])

export const integrationSourcesRelations = relations(integrationSources, ({ one }) => ({
  organization: one(organizations, {
    fields: [integrationSources.orgId],
    references: [organizations.id],
  }),
}))

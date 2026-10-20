import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { canaryTypeEnum } from './enums'
import { identities } from './identities'
import { organizations } from './organizations'

export const canaryIdentities = pgTable('canary_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id').notNull().references(() => identities.id),
  canaryType: canaryTypeEnum('canary_type').notNull(),
  description: text('description').notNull(),
  placementLocation: text('placement_location').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  triggerCount: integer('trigger_count').notNull().default(0),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  lastTriggeredSourceIp: text('last_triggered_source_ip'),
  alertWebhookUrl: text('alert_webhook_url'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_canary_identities_org_id').on(table.orgId),
  index('idx_canary_identities_identity_id').on(table.identityId),
  index('idx_canary_identities_enabled').on(table.enabled),
])

export const canaryTriggers = pgTable('canary_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  canaryId: uuid('canary_id').notNull().references(() => canaryIdentities.id),
  eventType: text('event_type').notNull(),
  sourceIp: text('source_ip').notNull(),
  sourceHostname: text('source_hostname'),
  rawEvent: jsonb('raw_event'),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  investigated: boolean('investigated').notNull().default(false),
  investigatedBy: uuid('investigated_by').references(() => identities.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
}, (table) => [
  index('idx_canary_triggers_canary_id').on(table.canaryId),
  index('idx_canary_triggers_org_id').on(table.orgId),
  index('idx_canary_triggers_triggered_at').on(table.triggeredAt),
])

export const canaryIdentitiesRelations = relations(canaryIdentities, ({ one, many }) => ({
  identity: one(identities, {
    fields: [canaryIdentities.identityId],
    references: [identities.id],
  }),
  organization: one(organizations, {
    fields: [canaryIdentities.orgId],
    references: [organizations.id],
  }),
  triggers: many(canaryTriggers),
}))

export const canaryTriggersRelations = relations(canaryTriggers, ({ one }) => ({
  canary: one(canaryIdentities, {
    fields: [canaryTriggers.canaryId],
    references: [canaryIdentities.id],
  }),
  investigator: one(identities, {
    fields: [canaryTriggers.investigatedBy],
    references: [identities.id],
  }),
}))

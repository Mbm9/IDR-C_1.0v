import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './organizations'
import { users } from './auth'

export const automationTriggerTypeEnum = ['data_change', 'threshold_breach', 'schedule', 'time_elapsed'] as const
export type AutomationTriggerType = (typeof automationTriggerTypeEnum)[number]

export const automationActionTypeEnum = [
  'disable_identity', 'revoke_entitlement', 'create_alert', 'create_violation', 'update_status', 'notify',
] as const
export type AutomationActionType = (typeof automationActionTypeEnum)[number]

export const automationRules = pgTable('automation_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  triggerType: text('trigger_type').notNull(), // data_change | threshold_breach | schedule | time_elapsed
  triggerCondition: jsonb('trigger_condition').notNull(), // the rule logic
  actionType: text('action_type').notNull(), // disable_identity | revoke_entitlement | create_alert | create_violation | update_status | notify
  actionParams: jsonb('action_params').default({}),
  notifyTargets: text('notify_targets').array().default([]), // roles or specific user IDs
  enabled: boolean('enabled').notNull().default(true),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  triggerCount: integer('trigger_count').notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_automation_rules_org_id').on(table.orgId),
  index('idx_automation_rules_enabled').on(table.enabled),
  index('idx_automation_rules_trigger_type').on(table.triggerType),
])

export const automationRulesRelations = relations(automationRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [automationRules.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [automationRules.createdBy],
    references: [users.id],
  }),
}))

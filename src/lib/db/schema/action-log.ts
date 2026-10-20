import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { actionTypeEnum, actionSourceEnum } from './enums'
import { identities } from './identities'
import { entitlements } from './entitlements'
import { policyViolations } from './violations'
import { organizations } from './organizations'

export const actionLog = pgTable('action_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionType: actionTypeEnum('action_type').notNull(),
  actorIdentityId: uuid('actor_identity_id').notNull(),
  targetIdentityId: uuid('target_identity_id').references(() => identities.id),
  targetEntitlementId: uuid('target_entitlement_id').references(() => entitlements.id),
  targetPolicyViolationId: uuid('target_policy_violation_id').references(() => policyViolations.id),
  payload: jsonb('payload').default({}),
  rationale: text('rationale'),
  source: actionSourceEnum('source').notNull(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_action_log_org_id').on(table.orgId),
  index('idx_action_log_actor').on(table.actorIdentityId),
  index('idx_action_log_created_at').on(table.createdAt),
  index('idx_action_log_action_type').on(table.actionType),
])

export const actionLogRelations = relations(actionLog, ({ one }) => ({
  actor: one(identities, {
    fields: [actionLog.actorIdentityId],
    references: [identities.id],
    relationName: 'actor',
  }),
  targetIdentity: one(identities, {
    fields: [actionLog.targetIdentityId],
    references: [identities.id],
    relationName: 'targetIdentity',
  }),
  targetEntitlement: one(entitlements, {
    fields: [actionLog.targetEntitlementId],
    references: [entitlements.id],
  }),
  targetViolation: one(policyViolations, {
    fields: [actionLog.targetPolicyViolationId],
    references: [policyViolations.id],
  }),
  organization: one(organizations, {
    fields: [actionLog.orgId],
    references: [organizations.id],
  }),
}))

import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { identities } from './identities'
import { organizations } from './organizations'

export const shadowAdmins = pgTable('shadow_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id').notNull().references(() => identities.id),
  detectionMethod: text('detection_method').notNull(), // acl_analysis, delegation_chain, nested_group, svc_ownership, gpo_rights
  detectionReasons: text('detection_reasons').array().notNull().default([]),
  effectiveRights: text('effective_rights').array().notNull().default([]),
  equivalentToGroups: text('equivalent_to_groups').array().notNull().default([]),
  riskScore: integer('risk_score').notNull().default(0),
  status: text('status').notNull().default('open'), // open, confirmed, dismissed, remediated
  confirmedBy: uuid('confirmed_by').references(() => identities.id),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_shadow_admins_identity_id').on(table.identityId),
  index('idx_shadow_admins_org_id').on(table.orgId),
  index('idx_shadow_admins_status').on(table.status),
])

export const shadowAdminsRelations = relations(shadowAdmins, ({ one }) => ({
  identity: one(identities, {
    fields: [shadowAdmins.identityId],
    references: [identities.id],
  }),
  confirmer: one(identities, {
    fields: [shadowAdmins.confirmedBy],
    references: [identities.id],
    relationName: 'confirmer',
  }),
  organization: one(organizations, {
    fields: [shadowAdmins.orgId],
    references: [organizations.id],
  }),
}))

import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { violationTypeEnum, severityEnum, violationStatusEnum } from './enums'
import { policies } from './policies'
import { identities } from './identities'
import { entitlements } from './entitlements'
import { organizations } from './organizations'

export const policyViolations = pgTable('policy_violations', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  identityId: uuid('identity_id').notNull().references(() => identities.id),
  entitlementId: uuid('entitlement_id').references(() => entitlements.id),
  violationType: violationTypeEnum('violation_type').notNull(),
  severity: severityEnum('severity').notNull(),
  status: violationStatusEnum('status').notNull().default('open'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  remediatedAt: timestamp('remediated_at', { withTimezone: true }),
  remediatedBy: uuid('remediated_by').references(() => identities.id),
  exceptionReason: text('exception_reason'),
  exceptionApprovedBy: uuid('exception_approved_by').references(() => identities.id),
  exceptionExpiresAt: timestamp('exception_expires_at', { withTimezone: true }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_violations_identity_id').on(table.identityId),
  index('idx_violations_policy_id').on(table.policyId),
  index('idx_violations_org_id').on(table.orgId),
  index('idx_violations_status').on(table.status),
  index('idx_violations_severity').on(table.severity),
  index('idx_violations_type').on(table.violationType),
])

export const policyViolationsRelations = relations(policyViolations, ({ one }) => ({
  policy: one(policies, {
    fields: [policyViolations.policyId],
    references: [policies.id],
  }),
  identity: one(identities, {
    fields: [policyViolations.identityId],
    references: [identities.id],
  }),
  entitlement: one(entitlements, {
    fields: [policyViolations.entitlementId],
    references: [entitlements.id],
  }),
  remediator: one(identities, {
    fields: [policyViolations.remediatedBy],
    references: [identities.id],
    relationName: 'remediator',
  }),
  exceptionApprover: one(identities, {
    fields: [policyViolations.exceptionApprovedBy],
    references: [identities.id],
    relationName: 'exceptionApprover',
  }),
  organization: one(organizations, {
    fields: [policyViolations.orgId],
    references: [organizations.id],
  }),
}))

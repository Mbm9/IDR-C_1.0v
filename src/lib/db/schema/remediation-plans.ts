import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { planStatusEnum, planGeneratedByEnum } from './enums'
import { identities } from './identities'
import { organizations } from './organizations'

export const remediationPlans = pgTable('remediation_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  generatedBy: planGeneratedByEnum('generated_by').notNull(),
  inputParams: jsonb('input_params').default({}),
  rankedActions: jsonb('ranked_actions').default([]),
  executiveSummary: text('executive_summary'),
  projectedRiskReduction: integer('projected_risk_reduction'),
  quickWins: jsonb('quick_wins').default([]),
  status: planStatusEnum('status').notNull().default('draft'),
  approvedBy: uuid('approved_by').references(() => identities.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_remediation_plans_org_id').on(table.orgId),
  index('idx_remediation_plans_status').on(table.status),
])

export const remediationPlansRelations = relations(remediationPlans, ({ one }) => ({
  approver: one(identities, {
    fields: [remediationPlans.approvedBy],
    references: [identities.id],
  }),
  organization: one(organizations, {
    fields: [remediationPlans.orgId],
    references: [organizations.id],
  }),
}))

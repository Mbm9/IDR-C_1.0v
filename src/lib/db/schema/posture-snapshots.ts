import { pgTable, uuid, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './organizations'

// Periodic snapshots of overall exposure posture — powers the Trend Insights time-series
// (exposure score, counts by severity/category/impact over time). One row per scan run.
export const postureSnapshots = pgTable('posture_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  exposureScore: integer('exposure_score').notNull().default(0),
  totalOpen: integer('total_open').notNull().default(0),
  bySeverity: jsonb('by_severity'), // { critical, high, medium, low }
  byCategory: jsonb('by_category'), // { identity, certificate, gpo, secret }
  byImpact: jsonb('by_impact'), // { credential_theft, privilege_escalation, ... }
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_posture_snapshots_org_id').on(table.orgId),
  index('idx_posture_snapshots_captured_at').on(table.capturedAt),
])

export const postureSnapshotsRelations = relations(postureSnapshots, ({ one }) => ({
  organization: one(organizations, {
    fields: [postureSnapshots.orgId],
    references: [organizations.id],
  }),
}))

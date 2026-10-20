import { pgTable, uuid, text, integer, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { issueStatusEnum, issueEventTypeEnum } from './enums'
import { organizations } from './organizations'

// Operator-managed state for an issue *type* (keyed by FSID). One row per (org, fsid).
// Also tracks last-seen affected count so the scanner can derive timeline events.
export const issueStatus = pgTable('issue_statuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  fsid: text('fsid').notNull(), // stable issue-type id, e.g. FS-KERBEROASTABLE
  status: issueStatusEnum('status').notNull().default('no_action'),
  notes: text('notes'),
  lastCount: integer('last_count').notNull().default(0),
  firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_issue_status_org_id').on(table.orgId),
  unique('uq_issue_status_org_fsid').on(table.orgId, table.fsid),
])

// Append-only timeline of lifecycle events per issue type.
export const issueEvents = pgTable('issue_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  fsid: text('fsid').notNull(),
  eventType: issueEventTypeEnum('event_type').notNull(),
  affectedCount: integer('affected_count').notNull().default(0),
  detail: text('detail'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_issue_events_org_id').on(table.orgId),
  index('idx_issue_events_fsid').on(table.fsid),
])

export const issueStatusRelations = relations(issueStatus, ({ one }) => ({
  organization: one(organizations, { fields: [issueStatus.orgId], references: [organizations.id] }),
}))
export const issueEventsRelations = relations(issueEvents, ({ one }) => ({
  organization: one(organizations, { fields: [issueEvents.orgId], references: [organizations.id] }),
}))

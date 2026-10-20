import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sessionLogonTypeEnum, tier0SessionStatusEnum } from './enums'
import { organizations } from './organizations'
import { identities } from './identities'
import { resources } from './resources'

// Live access sessions on Tier 0 infrastructure (Domain Controllers, AD DS, PKI, admin
// jump hosts). Answers "who is in the crown jewels right now?". Populated from logon
// telemetry (Windows Security 4624/4672, EDR session enumeration) via a collector; in the
// MVP this is demo/seed data — the live feed requires a session/EDR collector (preview).
export const tier0Sessions = pgTable('tier0_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id').notNull().references(() => identities.id, { onDelete: 'cascade' }),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  logonType: sessionLogonTypeEnum('logon_type').notNull().default('interactive'),
  privileged: boolean('privileged').notNull().default(false), // admin logon (event 4672)
  sourceHost: text('source_host'),
  sourceIp: text('source_ip'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }), // null while active
  status: tier0SessionStatusEnum('status').notNull().default('active'),
  anomalous: boolean('anomalous').notNull().default(false),
  anomalyReason: text('anomaly_reason'), // e.g. "off-hours", "new source host", "no MFA"
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_tier0_sessions_org_id').on(table.orgId),
  index('idx_tier0_sessions_status').on(table.status),
  index('idx_tier0_sessions_resource').on(table.resourceId),
  index('idx_tier0_sessions_identity').on(table.identityId),
  index('idx_tier0_sessions_started').on(table.startedAt),
])

export const tier0SessionsRelations = relations(tier0Sessions, ({ one }) => ({
  identity: one(identities, { fields: [tier0Sessions.identityId], references: [identities.id] }),
  resource: one(resources, { fields: [tier0Sessions.resourceId], references: [resources.id] }),
  organization: one(organizations, { fields: [tier0Sessions.orgId], references: [organizations.id] }),
}))

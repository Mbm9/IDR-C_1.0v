import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { identities } from './identities'

export const identityEvents = pgTable('identity_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(), // login_success, login_failure, mfa_prompt, mfa_success, mfa_failure, group_add, group_remove, password_change, password_reset, tgs_request, replication_request, oauth_consent, session_start, session_end
  source: text('source').notNull(), // azure_sign_in, ad_event_log, okta_syslog, manual
  identityId: uuid('identity_id').references(() => identities.id),
  rawEvent: jsonb('raw_event'),
  parsedFields: jsonb('parsed_fields'), // { ipAddress, location, userAgent, result, mfaMethod, riskLevel, targetResource, eventId, sessionId }
  eventTimestamp: timestamp('event_timestamp', { withTimezone: true }).notNull(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_identity_events_org_timestamp').on(table.orgId, table.eventTimestamp),
  index('idx_identity_events_org_identity_timestamp').on(table.orgId, table.identityId, table.eventTimestamp),
  index('idx_identity_events_event_type').on(table.eventType),
])

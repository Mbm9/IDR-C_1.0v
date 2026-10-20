import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { severityEnum, threatTypeEnum, killChainPhaseEnum, threatStatusEnum } from './enums'
import { organizations } from './organizations'
import { identities } from './identities'

export const identityThreats = pgTable('identity_threats', {
  id: uuid('id').primaryKey().defaultRandom(),
  threatType: threatTypeEnum('threat_type').notNull(),
  severity: severityEnum('severity').notNull(),
  status: threatStatusEnum('status').notNull().default('active'),
  identityId: uuid('identity_id').notNull().references(() => identities.id),
  killChainPhase: killChainPhaseEnum('kill_chain_phase').notNull(),
  evidence: jsonb('evidence'), // array of event IDs + summary
  sourceIp: text('source_ip'),
  sourceLocation: text('source_location'),
  targetResource: text('target_resource'),
  mitreTechniqueIds: text('mitre_technique_ids').array(),
  mitreTechniqueName: text('mitre_technique_name'),
  aiNarrative: text('ai_narrative'),
  confidence: integer('confidence').notNull().default(0), // 0-100
  detectionRuleId: uuid('detection_rule_id'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => identities.id),
  autoResponseTaken: text('auto_response_taken'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_identity_threats_org_id').on(table.orgId),
  index('idx_identity_threats_status').on(table.status),
  index('idx_identity_threats_severity').on(table.severity),
  index('idx_identity_threats_identity_id').on(table.identityId),
  index('idx_identity_threats_last_seen').on(table.lastSeenAt),
])

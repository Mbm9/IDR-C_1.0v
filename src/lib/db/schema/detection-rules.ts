import { pgTable, uuid, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { severityEnum } from './enums'
import { organizations } from './organizations'

export const detectionRules = pgTable('detection_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  threatType: text('threat_type').notNull(),
  killChainPhase: text('kill_chain_phase').notNull(),
  severity: severityEnum('severity').notNull(),
  logic: jsonb('logic').notNull(), // { type: "threshold"|"sequence"|"anomaly", params: {...}, conditions: [...] }
  enabled: boolean('enabled').notNull().default(true),
  mitreTechniqueIds: text('mitre_technique_ids').array(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_detection_rules_org_id').on(table.orgId),
  index('idx_detection_rules_enabled').on(table.enabled),
  index('idx_detection_rules_threat_type').on(table.threatType),
])

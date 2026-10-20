import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { exposureCategoryEnum, exposureImpactEnum, severityEnum, violationStatusEnum } from './enums'
import { organizations } from './organizations'

// Generic AD exposure findings for non-identity subjects (certificate templates, GPOs,
// exposed secrets). Identity-centric posture findings continue to live in policy_violations;
// the /api/exposures view unions both into one impact-grouped picture.
export const exposureFindings = pgTable('exposure_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: exposureCategoryEnum('category').notNull(),
  findingType: text('finding_type').notNull(), // e.g. 'esc1', 'rsop_conflict', 'gpp_cpassword'
  title: text('title').notNull(),
  severity: severityEnum('severity').notNull(),
  impact: exposureImpactEnum('impact').notNull(),
  subjectName: text('subject_name').notNull(), // template/GPO/file name
  subjectRef: text('subject_ref'), // optional opaque reference (guid, path, table id)
  evidence: jsonb('evidence'),
  status: violationStatusEnum('status').notNull().default('open'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_exposure_findings_org_id').on(table.orgId),
  index('idx_exposure_findings_category').on(table.category),
  index('idx_exposure_findings_status').on(table.status),
  index('idx_exposure_findings_impact').on(table.impact),
  index('idx_exposure_findings_severity').on(table.severity),
])

export const exposureFindingsRelations = relations(exposureFindings, ({ one }) => ({
  organization: one(organizations, {
    fields: [exposureFindings.orgId],
    references: [organizations.id],
  }),
}))

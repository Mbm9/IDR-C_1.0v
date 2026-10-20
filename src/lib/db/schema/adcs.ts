import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './organizations'

// Active Directory Certificate Services (AD CS) inventory — the data the ESC1–ESC8
// vulnerability checks (lib/itdr/adcs-checks.ts) evaluate.

// Certificate Authorities (enterprise CAs)
export const adcsAuthorities = pgTable('adcs_authorities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  dnsName: text('dns_name'),
  // CA-level security flags
  editfAttributeSubjectAltName2: boolean('editf_attribute_subject_alt_name2').notNull().default(false), // ESC6
  webEnrollmentHttp: boolean('web_enrollment_http').notNull().default(false), // ESC8 (NTLM relay to HTTP enrollment)
  enrollmentAgentRestrictionsEnabled: boolean('enrollment_agent_restrictions_enabled').notNull().default(true),
  lowPrivEnrollPrincipals: jsonb('low_priv_enroll_principals'), // principals that can request certs
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_adcs_authorities_org_id').on(table.orgId),
])

// Certificate templates published for enrollment
export const adcsTemplates = pgTable('adcs_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  caId: uuid('ca_id').references(() => adcsAuthorities.id),
  name: text('name').notNull(),
  displayName: text('display_name'),
  schemaVersion: integer('schema_version').notNull().default(2),
  published: boolean('published').notNull().default(true),
  // ESC-relevant attributes
  enrolleeSuppliesSubject: boolean('enrollee_supplies_subject').notNull().default(false), // SAN supplied by requester (ESC1)
  requiresManagerApproval: boolean('requires_manager_approval').notNull().default(false),
  authorizedSignaturesRequired: integer('authorized_signatures_required').notNull().default(0),
  ekus: text('ekus').array().default([]), // e.g. client_auth, any_purpose, enrollment_agent, smartcard_logon, no_eku
  enrollmentLowPriv: boolean('enrollment_low_priv').notNull().default(false), // low-priv principals have Enroll right (ESC1/2/3)
  aclWritableByLowPriv: boolean('acl_writable_by_low_priv').notNull().default(false), // ESC4 (template owner/write by low-priv)
  raw: jsonb('raw'),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_adcs_templates_org_id').on(table.orgId),
  index('idx_adcs_templates_ca_id').on(table.caId),
])

export const adcsAuthoritiesRelations = relations(adcsAuthorities, ({ one, many }) => ({
  organization: one(organizations, { fields: [adcsAuthorities.orgId], references: [organizations.id] }),
  templates: many(adcsTemplates),
}))

export const adcsTemplatesRelations = relations(adcsTemplates, ({ one }) => ({
  ca: one(adcsAuthorities, { fields: [adcsTemplates.caId], references: [adcsAuthorities.id] }),
  organization: one(organizations, { fields: [adcsTemplates.orgId], references: [organizations.id] }),
}))

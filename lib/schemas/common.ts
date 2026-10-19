import { z } from 'zod'

// Shared enum schemas
export const adTierSchema = z.enum(['tier_0', 'tier_top', 'tier_1', 'tier_2', 'unclassified'])
export const severitySchema = z.enum(['critical', 'high', 'medium', 'low'])
export const identityTypeSchema = z.enum(['human', 'non_human'])
export const identitySubTypeSchema = z.enum([
  'employee', 'contractor', 'vendor',
  'service_account', 'managed_identity', 'app_registration',
  'api_key', 'bot', 'machine', 'certificate',
])
export const identityStatusSchema = z.enum([
  'active', 'inactive', 'disabled', 'dormant', 'orphaned', 'suspended',
])
export const sourceSystemSchema = z.enum([
  'active_directory', 'azure_ad', 'okta', 'sailpoint', 'cyberark', 'manual',
])
export const platformSchema = z.enum([
  'ad', 'azure_ad', 'okta', 'sailpoint', 'cyberark', 'aws_iam', 'gcp_iam',
])
export const accountTypeSchema = z.enum([
  'standard', 'privileged', 'admin', 'service', 'shared', 'emergency',
])
export const permissionTypeSchema = z.enum([
  'role', 'group_membership', 'direct_assignment', 'inherited', 'delegated',
])
export const certificationStatusSchema = z.enum(['pending', 'certified', 'revoked', 'expired'])
export const violationTypeSchema = z.enum([
  'tier_breach', 'sod_conflict', 'excessive_privilege', 'dormant_access',
  'orphaned_identity', 'missing_mfa', 'expired_certification', 'password_age',
])
export const violationStatusSchema = z.enum([
  'open', 'acknowledged', 'remediated', 'excepted', 'false_positive',
])
export const actionTypeSchema = z.enum([
  'assess_identity', 'certify_entitlement', 'revoke_access', 'approve_exception',
  'escalate_risk', 'trigger_review', 'update_tier', 'sync_source',
  'generate_recommendation', 'acknowledge_violation',
  'login_success', 'login_failed',
  'change_role', 'invite_user', 'manage_integration', 'manage_api_key',
  'manage_canary', 'manage_detection_rule', 'manage_automation_rule', 'manage_webhook',
  'manage_gpo', 'import_data', 'data_quality_action', 'update_threat_status',
  'update_finding_status', 'run_scan', 'manage_remediation', 'manage_branding',
])
export const actionSourceSchema = z.enum(['manual', 'automated', 'ai_recommended'])

// Common field schemas
export const uuidSchema = z.string().uuid()
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

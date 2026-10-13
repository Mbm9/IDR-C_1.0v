import { pgEnum } from 'drizzle-orm/pg-core'

// Identity enums
export const identityTypeEnum = pgEnum('identity_type', ['human', 'non_human'])
export const identitySubTypeEnum = pgEnum('identity_sub_type', [
  'employee', 'contractor', 'vendor', 'partner',
  'service_account', 'managed_identity', 'app_registration',
  'api_key', 'bot', 'machine', 'certificate',
])
export const identityStatusEnum = pgEnum('identity_status', [
  'active', 'inactive', 'disabled', 'dormant', 'orphaned', 'suspended',
])

// AD tiering
export const adTierEnum = pgEnum('ad_tier', ['tier_0', 'tier_top', 'tier_1', 'tier_2', 'unclassified'])

// Source systems
export const sourceSystemEnum = pgEnum('source_system', [
  'active_directory', 'azure_ad', 'okta', 'sailpoint', 'cyberark', 'manual',
  'broadcom_sso', 'broadcom_pam', 'sailpoint_iiq', 'servicenow',
  'microsoft_defender', 'sap_grc', 'hashicorp_vault', 'splunk',
  'beyondtrust', 'digicert',
])

// Account enums
export const platformEnum = pgEnum('platform_type', [
  'ad', 'azure_ad', 'okta', 'sailpoint', 'cyberark', 'aws_iam', 'gcp_iam',
  'broadcom_sso', 'broadcom_pam', 'sailpoint_iiq', 'servicenow',
  'microsoft_defender', 'sap_grc', 'hashicorp_vault', 'splunk',
  'beyondtrust', 'digicert',
])
export const accountTypeEnum = pgEnum('account_type', [
  'standard', 'privileged', 'admin', 'service', 'shared', 'emergency',
])

// Group enums
export const groupTypeEnum = pgEnum('group_type', [
  'security', 'distribution', 'dynamic', 'role_based', 'privileged_access',
])
export const groupScopeEnum = pgEnum('group_scope', ['domain_local', 'global', 'universal'])
export const membershipTypeEnum = pgEnum('membership_type', ['direct', 'nested', 'dynamic'])

// Resource enums
export const resourceTypeEnum = pgEnum('resource_type', [
  'server', 'application', 'database', 'file_share', 'cloud_resource',
  'domain_controller', 'workstation', 'network_device', 'saas_app',
])
export const resourceCriticalityEnum = pgEnum('resource_criticality', [
  'critical', 'high', 'medium', 'low',
])
export const environmentEnum = pgEnum('environment_type', [
  'production', 'staging', 'development', 'dr',
])

// Entitlement enums
export const permissionTypeEnum = pgEnum('permission_type', [
  'role', 'group_membership', 'direct_assignment', 'inherited', 'delegated',
])
export const certificationStatusEnum = pgEnum('certification_status', [
  'pending', 'certified', 'revoked', 'expired',
])

// Policy enums
export const policyTypeEnum = pgEnum('policy_type', [
  'access_policy', 'tiering_rule', 'sod_rule', 'password_policy',
  'mfa_policy', 'lifecycle_policy', 'certification_policy',
])
export const severityEnum = pgEnum('severity_level', ['critical', 'high', 'medium', 'low'])

// Tier 0 live-access sessions: how an identity is logged on to a Tier 0 host, and session state.
export const sessionLogonTypeEnum = pgEnum('session_logon_type', [
  'interactive', 'remote_interactive', 'network', 'service', 'batch', 'unlock',
])
export const tier0SessionStatusEnum = pgEnum('tier0_session_status', ['active', 'ended'])

// Violation enums
export const violationTypeEnum = pgEnum('violation_type', [
  'tier_breach', 'sod_conflict', 'excessive_privilege', 'dormant_access',
  'orphaned_identity', 'missing_mfa', 'expired_certification', 'password_age',
  // AD exposure / posture checks (fsProtect-parity static assessment)
  'kerberoastable', 'asrep_roastable', 'unconstrained_delegation',
  'constrained_delegation', 'reversible_encryption', 'password_not_required',
  'password_never_expires', 'stale_privileged_account',
])
export const violationStatusEnum = pgEnum('violation_status', [
  'open', 'acknowledged', 'remediated', 'excepted', 'false_positive',
])

// Integration enums
export const integrationTypeEnum = pgEnum('integration_type', [
  'active_directory', 'azure_ad', 'okta', 'sailpoint', 'cyberark',
  'azure_logs', 'sso_provider', 'broadcom_sso', 'broadcom_pam', 'sailpoint_iiq', 'servicenow',
  'microsoft_defender', 'sap_grc', 'hashicorp_vault', 'splunk',
  'beyondtrust', 'digicert',
])
export const syncStatusEnum = pgEnum('sync_status', [
  'connected', 'syncing', 'error', 'disconnected',
])

// Action log enums
export const actionTypeEnum = pgEnum('action_type', [
  'assess_identity', 'certify_entitlement', 'revoke_access', 'approve_exception',
  'escalate_risk', 'trigger_review', 'update_tier', 'sync_source',
  'generate_recommendation', 'acknowledge_violation',
  'login_success', 'login_failed',
  'change_role', 'invite_user', 'manage_integration', 'manage_api_key',
  'manage_canary', 'manage_detection_rule', 'manage_automation_rule', 'manage_webhook',
  'manage_gpo', 'import_data', 'data_quality_action', 'update_threat_status',
  'update_finding_status', 'run_scan', 'manage_remediation',
])
export const actionSourceEnum = pgEnum('action_source', ['manual', 'automated', 'ai_recommended'])

// Remediation plan enums
export const planStatusEnum = pgEnum('plan_status', [
  'draft', 'approved', 'in_progress', 'completed', 'rejected',
])
// deterministic = rule-based fallback plan produced when no AI provider answered
export const planGeneratedByEnum = pgEnum('plan_generated_by', ['ai', 'manual', 'deterministic'])

// Notification enums
export const notificationTypeEnum = pgEnum('notification_type', [
  'violation_detected', 'certification_due', 'sync_failed',
  'exception_expiring', 'ai_analysis_complete', 'system',
])
export const notificationSeverityEnum = pgEnum('notification_severity', [
  'critical', 'high', 'medium', 'low', 'info',
])

// RBAC
export const appRoleEnum = pgEnum('app_role', ['viewer', 'analyst', 'iam_admin', 'ciso', 'admin'])

// Threat detection enums (Phase N1)
export const threatTypeEnum = pgEnum('threat_type', [
  'credential_stuffing', 'password_spray', 'kerberoasting', 'asrep_roasting',
  'dcsync', 'golden_ticket', 'lateral_movement', 'privilege_escalation',
  'token_replay', 'oauth_consent_abuse', 'impossible_travel', 'brute_force',
  'mfa_fatigue', 'service_account_abuse', 'insider_threat',
])

export const killChainPhaseEnum = pgEnum('kill_chain_phase', [
  'reconnaissance', 'initial_access', 'credential_access', 'privilege_escalation',
  'lateral_movement', 'persistence', 'exfiltration', 'impact',
])

export const threatStatusEnum = pgEnum('threat_status', [
  'active', 'investigating', 'contained', 'resolved', 'false_positive',
])

export const canaryTypeEnum = pgEnum('canary_type', [
  'fake_admin', 'fake_service', 'fake_gmsa', 'fake_vpn', 'fake_api_key',
])

// Data quality enums (Phase E2)
export const matchMethodEnum = pgEnum('match_method', ['deterministic', 'fuzzy', 'ai', 'manual'])
export const aliasStatusEnum = pgEnum('alias_status', ['pending_review', 'confirmed', 'rejected'])

// Issue lifecycle enums (fsProtect-parity: managed finding workflow + timeline)
export const issueStatusEnum = pgEnum('issue_status', [
  'no_action', 'in_progress', 'done', 'accepted_risk',
])
export const issueEventTypeEnum = pgEnum('issue_event_type', [
  'first_detected', 'risk_increased', 'reappeared',
  'partially_remediated', 'fully_remediated', 'status_changed',
])

// AD Exposure assessment enums (fsProtect-parity: certificate/GPO/secret findings)
export const exposureCategoryEnum = pgEnum('exposure_category', [
  'identity', 'certificate', 'gpo', 'secret',
])
export const exposureImpactEnum = pgEnum('exposure_impact', [
  'credential_theft', 'privilege_escalation', 'lateral_movement', 'persistence',
])

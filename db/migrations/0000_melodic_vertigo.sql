CREATE TYPE "public"."account_type" AS ENUM('standard', 'privileged', 'admin', 'service', 'shared', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."action_source" AS ENUM('manual', 'automated', 'ai_recommended');--> statement-breakpoint
CREATE TYPE "public"."action_type" AS ENUM('assess_identity', 'certify_entitlement', 'revoke_access', 'approve_exception', 'escalate_risk', 'trigger_review', 'update_tier', 'sync_source', 'generate_recommendation', 'acknowledge_violation');--> statement-breakpoint
CREATE TYPE "public"."ad_tier" AS ENUM('tier_0', 'tier_1', 'tier_2', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('viewer', 'analyst', 'iam_admin', 'ciso', 'admin');--> statement-breakpoint
CREATE TYPE "public"."canary_type" AS ENUM('fake_admin', 'fake_service', 'fake_gmsa', 'fake_vpn', 'fake_api_key');--> statement-breakpoint
CREATE TYPE "public"."certification_status" AS ENUM('pending', 'certified', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."environment_type" AS ENUM('production', 'staging', 'development', 'dr');--> statement-breakpoint
CREATE TYPE "public"."group_scope" AS ENUM('domain_local', 'global', 'universal');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('security', 'distribution', 'dynamic', 'role_based', 'privileged_access');--> statement-breakpoint
CREATE TYPE "public"."identity_status" AS ENUM('active', 'inactive', 'disabled', 'dormant', 'orphaned', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."identity_sub_type" AS ENUM('employee', 'contractor', 'vendor', 'partner', 'service_account', 'managed_identity', 'app_registration', 'api_key', 'bot', 'machine', 'certificate');--> statement-breakpoint
CREATE TYPE "public"."identity_type" AS ENUM('human', 'non_human');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('active_directory', 'azure_ad', 'okta', 'sailpoint', 'cyberark', 'azure_logs', 'sso_provider', 'broadcom_sso', 'broadcom_pam', 'sailpoint_iiq');--> statement-breakpoint
CREATE TYPE "public"."kill_chain_phase" AS ENUM('reconnaissance', 'initial_access', 'credential_access', 'privilege_escalation', 'lateral_movement', 'persistence', 'exfiltration', 'impact');--> statement-breakpoint
CREATE TYPE "public"."membership_type" AS ENUM('direct', 'nested', 'dynamic');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('violation_detected', 'certification_due', 'sync_failed', 'exception_expiring', 'ai_analysis_complete', 'system');--> statement-breakpoint
CREATE TYPE "public"."permission_type" AS ENUM('role', 'group_membership', 'direct_assignment', 'inherited', 'delegated');--> statement-breakpoint
CREATE TYPE "public"."plan_generated_by" AS ENUM('ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'approved', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."platform_type" AS ENUM('ad', 'azure_ad', 'okta', 'sailpoint', 'cyberark', 'aws_iam', 'gcp_iam', 'broadcom_sso', 'broadcom_pam', 'sailpoint_iiq');--> statement-breakpoint
CREATE TYPE "public"."policy_type" AS ENUM('access_policy', 'tiering_rule', 'sod_rule', 'password_policy', 'mfa_policy', 'lifecycle_policy', 'certification_policy');--> statement-breakpoint
CREATE TYPE "public"."resource_criticality" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('server', 'application', 'database', 'file_share', 'cloud_resource', 'domain_controller', 'workstation', 'network_device', 'saas_app');--> statement-breakpoint
CREATE TYPE "public"."severity_level" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."source_system" AS ENUM('active_directory', 'azure_ad', 'okta', 'sailpoint', 'cyberark', 'manual', 'broadcom_sso', 'broadcom_pam', 'sailpoint_iiq');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('connected', 'syncing', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."threat_status" AS ENUM('active', 'investigating', 'contained', 'resolved', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."threat_type" AS ENUM('credential_stuffing', 'password_spray', 'kerberoasting', 'asrep_roasting', 'dcsync', 'golden_ticket', 'lateral_movement', 'privilege_escalation', 'token_replay', 'oauth_consent_abuse', 'impossible_travel', 'brute_force', 'mfa_fatigue', 'service_account_abuse', 'insider_threat');--> statement-breakpoint
CREATE TYPE "public"."violation_status" AS ENUM('open', 'acknowledged', 'remediated', 'excepted', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."violation_type" AS ENUM('tier_breach', 'sod_conflict', 'excessive_privilege', 'dormant_access', 'orphaned_identity', 'missing_mfa', 'expired_certification', 'password_age');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'professional', 'enterprise');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"industry" text,
	"regulatory_frameworks" text[] DEFAULT '{}',
	"ad_forest_name" text,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"type" "identity_type" NOT NULL,
	"sub_type" "identity_sub_type" NOT NULL,
	"status" "identity_status" DEFAULT 'active' NOT NULL,
	"ad_tier" "ad_tier" DEFAULT 'unclassified' NOT NULL,
	"effective_tier" "ad_tier",
	"tier_violation" boolean DEFAULT false NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_factors" jsonb DEFAULT '[]'::jsonb,
	"source_system" "source_system" NOT NULL,
	"source_id" text,
	"upn" text,
	"sam_account_name" text,
	"email" text,
	"department" text,
	"manager_identity_id" uuid,
	"last_logon_at" timestamp with time zone,
	"password_last_set_at" timestamp with time zone,
	"created_in_source_at" timestamp with time zone,
	"owner_identity_id" uuid,
	"expiry_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"platform" "platform_type" NOT NULL,
	"account_name" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_authenticated_at" timestamp with time zone,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_methods" text[] DEFAULT '{}',
	"privileged" boolean DEFAULT false NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"membership_type" "membership_type" DEFAULT 'direct' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" text,
	"org_id" uuid NOT NULL,
	CONSTRAINT "uq_group_membership" UNIQUE("group_id","identity_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "group_type" NOT NULL,
	"scope" "group_scope" NOT NULL,
	"ad_tier" "ad_tier" DEFAULT 'unclassified' NOT NULL,
	"source_system" "source_system" NOT NULL,
	"source_id" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"nested_group_count" integer DEFAULT 0 NOT NULL,
	"is_privileged" boolean DEFAULT false NOT NULL,
	"owner_identity_id" uuid,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "resource_type" NOT NULL,
	"ad_tier" "ad_tier" DEFAULT 'unclassified' NOT NULL,
	"criticality" "resource_criticality" DEFAULT 'medium' NOT NULL,
	"environment" "environment_type" DEFAULT 'production' NOT NULL,
	"owner_identity_id" uuid,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"permission_type" "permission_type" NOT NULL,
	"permission_name" text NOT NULL,
	"permission_scope" text,
	"ad_tier_of_permission" "ad_tier" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" text,
	"last_used_at" timestamp with time zone,
	"certifiable" boolean DEFAULT true NOT NULL,
	"certification_status" "certification_status" DEFAULT 'pending' NOT NULL,
	"last_certified_at" timestamp with time zone,
	"certified_by" uuid,
	"risk_tags" text[] DEFAULT '{}',
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "policy_type" NOT NULL,
	"definition" jsonb NOT NULL,
	"severity" "severity_level" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"framework_mappings" jsonb DEFAULT '{}'::jsonb,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"entitlement_id" uuid,
	"violation_type" "violation_type" NOT NULL,
	"severity" "severity_level" NOT NULL,
	"status" "violation_status" DEFAULT 'open' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"remediated_at" timestamp with time zone,
	"remediated_by" uuid,
	"exception_reason" text,
	"exception_approved_by" uuid,
	"exception_expires_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "integration_type" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"sync_status" "sync_status" DEFAULT 'disconnected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_record_count" integer DEFAULT 0,
	"sync_frequency_minutes" integer DEFAULT 360 NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" "action_type" NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"target_identity_id" uuid,
	"target_entitlement_id" uuid,
	"target_policy_violation_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"rationale" text,
	"source" "action_source" NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remediation_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by" "plan_generated_by" NOT NULL,
	"input_params" jsonb DEFAULT '{}'::jsonb,
	"ranked_actions" jsonb DEFAULT '[]'::jsonb,
	"executive_summary" text,
	"projected_risk_reduction" integer,
	"quick_wins" jsonb DEFAULT '[]'::jsonb,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"hashed_password" text,
	"app_role" "app_role" DEFAULT 'viewer' NOT NULL,
	"org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"org_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tier" "subscription_tier" DEFAULT 'free' NOT NULL,
	"max_identities" integer DEFAULT 500 NOT NULL,
	"max_integrations" integer DEFAULT 1 NOT NULL,
	"max_users" integer DEFAULT 3 NOT NULL,
	"max_ai_runs_per_month" integer DEFAULT 5 NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"api_access" boolean DEFAULT false NOT NULL,
	"sso_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"link" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_identity_id" uuid NOT NULL,
	"target_dn" text NOT NULL,
	"target_object_type" text NOT NULL,
	"permission" text NOT NULL,
	"inherited" boolean DEFAULT false NOT NULL,
	"ad_tier_of_target" "ad_tier" DEFAULT 'unclassified' NOT NULL,
	"dangerous" boolean DEFAULT false NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acl_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_dn" text NOT NULL,
	"object_type" text NOT NULL,
	"principal_identity_id" uuid,
	"principal_group_id" uuid,
	"access_type" text NOT NULL,
	"rights" text[] NOT NULL,
	"object_type_guid" text,
	"ad_tier_of_object" "ad_tier" DEFAULT 'unclassified' NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attack_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_identity_id" uuid NOT NULL,
	"target_identity_id" uuid,
	"target_resource_id" uuid,
	"path_nodes" jsonb NOT NULL,
	"path_edges" jsonb NOT NULL,
	"path_length" integer NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"attack_technique" text NOT NULL,
	"mitre_id" text,
	"ai_narrative" text,
	"status" "violation_status" DEFAULT 'open' NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"source" text NOT NULL,
	"identity_id" uuid,
	"raw_event" jsonb,
	"parsed_fields" jsonb,
	"event_timestamp" timestamp with time zone NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_threats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"threat_type" "threat_type" NOT NULL,
	"severity" "severity_level" NOT NULL,
	"status" "threat_status" DEFAULT 'active' NOT NULL,
	"identity_id" uuid NOT NULL,
	"kill_chain_phase" "kill_chain_phase" NOT NULL,
	"evidence" jsonb,
	"source_ip" text,
	"source_location" text,
	"target_resource" text,
	"mitre_technique_ids" text[],
	"mitre_technique_name" text,
	"ai_narrative" text,
	"confidence" integer DEFAULT 0 NOT NULL,
	"detection_rule_id" uuid,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"auto_response_taken" text,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detection_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"threat_type" text NOT NULL,
	"kill_chain_phase" text NOT NULL,
	"severity" "severity_level" NOT NULL,
	"logic" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mitre_technique_ids" text[],
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadow_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"detection_method" text NOT NULL,
	"detection_reasons" text[] DEFAULT '{}' NOT NULL,
	"effective_rights" text[] DEFAULT '{}' NOT NULL,
	"equivalent_to_groups" text[] DEFAULT '{}' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"org_id" uuid NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canary_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"canary_type" "canary_type" NOT NULL,
	"description" text NOT NULL,
	"placement_location" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"last_triggered_source_ip" text,
	"alert_webhook_url" text,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canary_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canary_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"source_ip" text NOT NULL,
	"source_hostname" text,
	"raw_event" jsonb,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"investigated" boolean DEFAULT false NOT NULL,
	"investigated_by" uuid,
	"org_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peer_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"peer_group_id" uuid NOT NULL,
	"anomaly_type" text NOT NULL,
	"entitlement_count" integer NOT NULL,
	"peer_median" real NOT NULL,
	"deviation_score" real NOT NULL,
	"excess_entitlements" jsonb DEFAULT '[]'::jsonb,
	"unique_entitlements" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"ai_narrative" text,
	"org_id" uuid NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peer_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"ad_tier" "ad_tier" NOT NULL,
	"sub_type" "identity_sub_type" NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"median_entitlement_count" real DEFAULT 0 NOT NULL,
	"avg_entitlement_count" real DEFAULT 0 NOT NULL,
	"stddev_entitlement_count" real DEFAULT 0 NOT NULL,
	"common_entitlements" jsonb DEFAULT '[]'::jsonb,
	"org_id" uuid NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_identity_id_identities_id_fk" FOREIGN KEY ("owner_identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_identity_id_identities_id_fk" FOREIGN KEY ("owner_identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_certified_by_identities_id_fk" FOREIGN KEY ("certified_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_entitlement_id_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_remediated_by_identities_id_fk" FOREIGN KEY ("remediated_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_exception_approved_by_identities_id_fk" FOREIGN KEY ("exception_approved_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_violations" ADD CONSTRAINT "policy_violations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sources" ADD CONSTRAINT "integration_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_target_identity_id_identities_id_fk" FOREIGN KEY ("target_identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_target_entitlement_id_entitlements_id_fk" FOREIGN KEY ("target_entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_target_policy_violation_id_policy_violations_id_fk" FOREIGN KEY ("target_policy_violation_id") REFERENCES "public"."policy_violations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_approved_by_identities_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_delegations" ADD CONSTRAINT "ad_delegations_source_identity_id_identities_id_fk" FOREIGN KEY ("source_identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_delegations" ADD CONSTRAINT "ad_delegations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acl_entries" ADD CONSTRAINT "acl_entries_principal_identity_id_identities_id_fk" FOREIGN KEY ("principal_identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acl_entries" ADD CONSTRAINT "acl_entries_principal_group_id_groups_id_fk" FOREIGN KEY ("principal_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acl_entries" ADD CONSTRAINT "acl_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attack_paths" ADD CONSTRAINT "attack_paths_source_identity_id_identities_id_fk" FOREIGN KEY ("source_identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attack_paths" ADD CONSTRAINT "attack_paths_target_identity_id_identities_id_fk" FOREIGN KEY ("target_identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attack_paths" ADD CONSTRAINT "attack_paths_target_resource_id_resources_id_fk" FOREIGN KEY ("target_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attack_paths" ADD CONSTRAINT "attack_paths_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_events" ADD CONSTRAINT "identity_events_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_events" ADD CONSTRAINT "identity_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_threats" ADD CONSTRAINT "identity_threats_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_threats" ADD CONSTRAINT "identity_threats_resolved_by_identities_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_threats" ADD CONSTRAINT "identity_threats_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detection_rules" ADD CONSTRAINT "detection_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_admins" ADD CONSTRAINT "shadow_admins_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_admins" ADD CONSTRAINT "shadow_admins_confirmed_by_identities_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_admins" ADD CONSTRAINT "shadow_admins_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canary_identities" ADD CONSTRAINT "canary_identities_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canary_identities" ADD CONSTRAINT "canary_identities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canary_triggers" ADD CONSTRAINT "canary_triggers_canary_id_canary_identities_id_fk" FOREIGN KEY ("canary_id") REFERENCES "public"."canary_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canary_triggers" ADD CONSTRAINT "canary_triggers_investigated_by_identities_id_fk" FOREIGN KEY ("investigated_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canary_triggers" ADD CONSTRAINT "canary_triggers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_anomalies" ADD CONSTRAINT "peer_anomalies_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_anomalies" ADD CONSTRAINT "peer_anomalies_peer_group_id_peer_groups_id_fk" FOREIGN KEY ("peer_group_id") REFERENCES "public"."peer_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_anomalies" ADD CONSTRAINT "peer_anomalies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_groups" ADD CONSTRAINT "peer_groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_identities_org_id" ON "identities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_identities_type" ON "identities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_identities_status" ON "identities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_identities_ad_tier" ON "identities" USING btree ("ad_tier");--> statement-breakpoint
CREATE INDEX "idx_identities_risk_score" ON "identities" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX "idx_identities_source_system" ON "identities" USING btree ("source_system");--> statement-breakpoint
CREATE INDEX "idx_identities_last_logon" ON "identities" USING btree ("last_logon_at");--> statement-breakpoint
CREATE INDEX "idx_accounts_identity_id" ON "accounts" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_org_id" ON "accounts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_group_memberships_group_id" ON "group_memberships" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_group_memberships_identity_id" ON "group_memberships" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_groups_org_id" ON "groups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_groups_ad_tier" ON "groups" USING btree ("ad_tier");--> statement-breakpoint
CREATE INDEX "idx_resources_org_id" ON "resources" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_resources_ad_tier" ON "resources" USING btree ("ad_tier");--> statement-breakpoint
CREATE INDEX "idx_entitlements_identity_id" ON "entitlements" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_entitlements_resource_id" ON "entitlements" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_entitlements_org_id" ON "entitlements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_entitlements_certification_status" ON "entitlements" USING btree ("certification_status");--> statement-breakpoint
CREATE INDEX "idx_entitlements_ad_tier" ON "entitlements" USING btree ("ad_tier_of_permission");--> statement-breakpoint
CREATE INDEX "idx_policies_org_id" ON "policies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_violations_identity_id" ON "policy_violations" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_violations_policy_id" ON "policy_violations" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "idx_violations_org_id" ON "policy_violations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_violations_status" ON "policy_violations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_violations_severity" ON "policy_violations" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_violations_type" ON "policy_violations" USING btree ("violation_type");--> statement-breakpoint
CREATE INDEX "idx_integrations_org_id" ON "integration_sources" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_integrations_sync_status" ON "integration_sources" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "idx_action_log_org_id" ON "action_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_action_log_actor" ON "action_log" USING btree ("actor_identity_id");--> statement-breakpoint
CREATE INDEX "idx_action_log_created_at" ON "action_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_action_log_action_type" ON "action_log" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_remediation_plans_org_id" ON "remediation_plans" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_remediation_plans_status" ON "remediation_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_org_id" ON "notifications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_read" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ad_delegations_source_identity" ON "ad_delegations" USING btree ("source_identity_id");--> statement-breakpoint
CREATE INDEX "idx_ad_delegations_org_id" ON "ad_delegations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_ad_delegations_dangerous" ON "ad_delegations" USING btree ("dangerous");--> statement-breakpoint
CREATE INDEX "idx_ad_delegations_tier" ON "ad_delegations" USING btree ("ad_tier_of_target");--> statement-breakpoint
CREATE INDEX "idx_acl_entries_principal_identity" ON "acl_entries" USING btree ("principal_identity_id");--> statement-breakpoint
CREATE INDEX "idx_acl_entries_principal_group" ON "acl_entries" USING btree ("principal_group_id");--> statement-breakpoint
CREATE INDEX "idx_acl_entries_org_id" ON "acl_entries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_acl_entries_object_dn" ON "acl_entries" USING btree ("object_dn");--> statement-breakpoint
CREATE INDEX "idx_acl_entries_tier" ON "acl_entries" USING btree ("ad_tier_of_object");--> statement-breakpoint
CREATE INDEX "idx_attack_paths_source_identity" ON "attack_paths" USING btree ("source_identity_id");--> statement-breakpoint
CREATE INDEX "idx_attack_paths_target_identity" ON "attack_paths" USING btree ("target_identity_id");--> statement-breakpoint
CREATE INDEX "idx_attack_paths_target_resource" ON "attack_paths" USING btree ("target_resource_id");--> statement-breakpoint
CREATE INDEX "idx_attack_paths_org_id" ON "attack_paths" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_attack_paths_risk_score" ON "attack_paths" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX "idx_attack_paths_status" ON "attack_paths" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_identity_events_org_timestamp" ON "identity_events" USING btree ("org_id","event_timestamp");--> statement-breakpoint
CREATE INDEX "idx_identity_events_org_identity_timestamp" ON "identity_events" USING btree ("org_id","identity_id","event_timestamp");--> statement-breakpoint
CREATE INDEX "idx_identity_events_event_type" ON "identity_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_identity_threats_org_id" ON "identity_threats" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_identity_threats_status" ON "identity_threats" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_identity_threats_severity" ON "identity_threats" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_identity_threats_identity_id" ON "identity_threats" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_identity_threats_last_seen" ON "identity_threats" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_detection_rules_org_id" ON "detection_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_detection_rules_enabled" ON "detection_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_detection_rules_threat_type" ON "detection_rules" USING btree ("threat_type");--> statement-breakpoint
CREATE INDEX "idx_shadow_admins_identity_id" ON "shadow_admins" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_shadow_admins_org_id" ON "shadow_admins" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_shadow_admins_status" ON "shadow_admins" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_canary_identities_org_id" ON "canary_identities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_canary_identities_identity_id" ON "canary_identities" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_canary_identities_enabled" ON "canary_identities" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_canary_triggers_canary_id" ON "canary_triggers" USING btree ("canary_id");--> statement-breakpoint
CREATE INDEX "idx_canary_triggers_org_id" ON "canary_triggers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_canary_triggers_triggered_at" ON "canary_triggers" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "idx_peer_anomalies_identity_id" ON "peer_anomalies" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_peer_anomalies_peer_group_id" ON "peer_anomalies" USING btree ("peer_group_id");--> statement-breakpoint
CREATE INDEX "idx_peer_anomalies_org_id" ON "peer_anomalies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_peer_anomalies_status" ON "peer_anomalies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_peer_groups_org_id" ON "peer_groups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_peer_groups_department" ON "peer_groups" USING btree ("department");
/**
 * Pre-Built Automation Rule Templates
 *
 * Out-of-the-box automation rules that admins can enable with one click.
 * Each template maps to the automation engine's trigger/action types.
 *
 * Templates cover the most common identity lifecycle scenarios:
 * - Dormant identity detection and auto-disable
 * - Orphaned NHI cleanup
 * - Tier violation escalation
 * - Certification expiry alerts
 * - High-risk identity alerts
 * - Password age violations
 */

export interface AutomationTemplate {
  id: string
  name: string
  description: string
  category: 'lifecycle' | 'security' | 'compliance' | 'hygiene'
  severity: 'critical' | 'high' | 'medium' | 'low'
  triggerType: 'time_elapsed' | 'threshold_breach' | 'schedule' | 'data_change'
  triggerCondition: Record<string, unknown>
  actionType: 'disable_identity' | 'create_alert' | 'create_violation' | 'update_status' | 'notify'
  actionParams: Record<string, unknown>
  notifyTargets: string[]
  /** Suggested: enable by default for new orgs */
  enabledByDefault: boolean
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ─── Lifecycle Templates ────────────────────────────────────────
  {
    id: 'dormant-identity-disable',
    name: 'Auto-Disable Dormant Identities',
    description: 'Automatically disable human identities that have not logged in for 90+ days. Prevents stale accounts from being hijacked.',
    category: 'lifecycle',
    severity: 'medium',
    triggerType: 'time_elapsed',
    triggerCondition: { thresholdDays: 90 },
    actionType: 'disable_identity',
    actionParams: {},
    notifyTargets: ['iam_admin'],
    enabledByDefault: true,
  },
  {
    id: 'dormant-identity-alert',
    name: 'Alert on Dormant Identities (60 days)',
    description: 'Send an early warning when identities have been inactive for 60 days, before the 90-day auto-disable kicks in.',
    category: 'lifecycle',
    severity: 'low',
    triggerType: 'time_elapsed',
    triggerCondition: { thresholdDays: 60 },
    actionType: 'create_alert',
    actionParams: {
      title: 'Dormant Identity Warning',
      message: 'Identities inactive for 60+ days detected. Review before auto-disable at 90 days.',
      severity: 'medium',
    },
    notifyTargets: ['iam_admin', 'analyst'],
    enabledByDefault: false,
  },
  {
    id: 'orphaned-nhi-alert',
    name: 'Alert on Orphaned Non-Human Identities',
    description: 'Notify IAM admins when non-human identities (service accounts, managed identities) have no owner or their owner is disabled.',
    category: 'lifecycle',
    severity: 'high',
    triggerType: 'schedule',
    triggerCondition: { schedule: 'daily' },
    actionType: 'notify',
    actionParams: {
      title: 'Orphaned NHI Detected',
      message: 'Non-human identities without active owners were found. Assign owners to maintain accountability.',
    },
    notifyTargets: ['iam_admin', 'ciso'],
    enabledByDefault: true,
  },

  // ─── Security Templates ─────────────────────────────────────────
  {
    id: 'tier-violation-escalate',
    name: 'Escalate Tier Violations to CISO',
    description: 'Immediately notify the CISO when new tier violations are detected (e.g., Tier 2 account accessing Tier 0 resources).',
    category: 'security',
    severity: 'critical',
    triggerType: 'data_change',
    triggerCondition: { actionTypes: ['update_tier'] },
    actionType: 'notify',
    actionParams: {
      title: 'CRITICAL: Tier Violation Detected',
      message: 'A cross-tier access violation has been detected. Immediate review required.',
    },
    notifyTargets: ['ciso', 'admin'],
    enabledByDefault: true,
  },
  {
    id: 'high-risk-identity-alert',
    name: 'Alert on High-Risk Identities (Score > 80)',
    description: 'Notify security team when any identity\'s risk score exceeds 80, indicating critical risk accumulation.',
    category: 'security',
    severity: 'high',
    triggerType: 'threshold_breach',
    triggerCondition: { metric: 'riskScore', operator: '>', threshold: 80 },
    actionType: 'create_alert',
    actionParams: {
      title: 'High-Risk Identity Alert',
      message: 'Identities with risk score above 80 detected. Review and remediate.',
      severity: 'high',
    },
    notifyTargets: ['analyst', 'ciso'],
    enabledByDefault: true,
  },
  {
    id: 'shadow-admin-alert',
    name: 'Alert on New Shadow Admins',
    description: 'Notify when the shadow admin scanner detects identities with hidden administrative privileges.',
    category: 'security',
    severity: 'critical',
    triggerType: 'data_change',
    triggerCondition: { actionTypes: ['assess_identity'] },
    actionType: 'notify',
    actionParams: {
      title: 'Shadow Admin Detected',
      message: 'New hidden administrative accounts discovered. Review immediately.',
    },
    notifyTargets: ['ciso', 'admin'],
    enabledByDefault: false,
  },

  // ─── Compliance Templates ───────────────────────────────────────
  {
    id: 'certification-expiry-alert',
    name: 'Alert on Expired Certifications',
    description: 'Notify IAM admins when access certifications expire, ensuring timely re-certification for compliance.',
    category: 'compliance',
    severity: 'medium',
    triggerType: 'schedule',
    triggerCondition: { schedule: 'daily' },
    actionType: 'create_violation',
    actionParams: {
      violationType: 'expired_certification',
      severity: 'medium',
    },
    notifyTargets: ['iam_admin'],
    enabledByDefault: true,
  },
  {
    id: 'excessive-violations-alert',
    name: 'Alert When Violations Exceed Threshold',
    description: 'Escalate to CISO when open violations exceed 50, indicating systemic compliance issues.',
    category: 'compliance',
    severity: 'high',
    triggerType: 'threshold_breach',
    triggerCondition: { metric: 'openViolations', operator: '>', threshold: 50 },
    actionType: 'notify',
    actionParams: {
      title: 'Excessive Open Violations',
      message: 'Open violation count exceeds threshold. Systemic compliance review recommended.',
    },
    notifyTargets: ['ciso'],
    enabledByDefault: false,
  },

  // ─── Hygiene Templates ──────────────────────────────────────────
  {
    id: 'missing-mfa-alert',
    name: 'Weekly MFA Coverage Report',
    description: 'Send a weekly summary of accounts missing MFA to drive adoption.',
    category: 'hygiene',
    severity: 'medium',
    triggerType: 'schedule',
    triggerCondition: { schedule: 'weekly' },
    actionType: 'notify',
    actionParams: {
      title: 'MFA Coverage Report',
      message: 'Weekly report: accounts without MFA enabled need attention.',
    },
    notifyTargets: ['iam_admin'],
    enabledByDefault: false,
  },
  {
    id: 'password-age-violation',
    name: 'Flag Stale Passwords (180+ days)',
    description: 'Create violations for identities with passwords older than 180 days.',
    category: 'hygiene',
    severity: 'low',
    triggerType: 'schedule',
    triggerCondition: { schedule: 'weekly', thresholdDays: 180 },
    actionType: 'create_violation',
    actionParams: {
      violationType: 'password_age',
      severity: 'low',
    },
    notifyTargets: ['iam_admin'],
    enabledByDefault: false,
  },
]

export function getTemplatesByCategory(): Record<string, AutomationTemplate[]> {
  return AUTOMATION_TEMPLATES.reduce<Record<string, AutomationTemplate[]>>((acc, t) => {
    (acc[t.category] ||= []).push(t)
    return acc
  }, {})
}

export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find(t => t.id === id)
}

export function getDefaultTemplates(): AutomationTemplate[] {
  return AUTOMATION_TEMPLATES.filter(t => t.enabledByDefault)
}

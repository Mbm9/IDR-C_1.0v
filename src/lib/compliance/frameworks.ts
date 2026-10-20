/**
 * Saudi Regulatory Compliance Framework Mappings
 *
 * Maps Identity Radar capabilities to NCA ECC, SAMA CSF, and PDPL controls.
 * Each control tracks:
 *  - which IDR feature covers it
 *  - how coverage is measured (automated checks vs manual evidence)
 *  - the violation types that indicate non-compliance
 */

export interface ComplianceControl {
  id: string
  name: string
  description: string
  category: string
  /** IDR feature that addresses this control */
  coveredBy: string[]
  /** Violation types that indicate non-compliance */
  relatedViolations: string[]
  /** How compliance is assessed: 'automated' | 'evidence' | 'manual' */
  assessmentMethod: 'automated' | 'evidence' | 'manual'
}

export interface ComplianceFramework {
  key: string
  name: string
  fullName: string
  description: string
  version: string
  controls: ComplianceControl[]
}

// ─── NCA Essential Cybersecurity Controls (ECC-1:2018) ──────────────

export const NCA_ECC: ComplianceFramework = {
  key: 'NCA_ECC',
  name: 'NCA ECC',
  fullName: 'National Cybersecurity Authority - Essential Cybersecurity Controls',
  description: 'Mandatory cybersecurity controls for government and critical infrastructure organizations in Saudi Arabia.',
  version: 'ECC-1:2018',
  controls: [
    {
      id: 'ECC-2-1-1',
      name: 'Identity Management',
      description: 'Establish and maintain identity management for users, devices, and systems.',
      category: 'Identity & Access Management',
      coveredBy: ['Identity Explorer', 'NHI Inventory', 'Identity Graph'],
      relatedViolations: ['orphaned_identity', 'dormant_access'],
      assessmentMethod: 'automated',
    },
    {
      id: 'ECC-2-1-2',
      name: 'Access Control',
      description: 'Implement access control based on least privilege and separation of duties.',
      category: 'Identity & Access Management',
      coveredBy: ['Entitlement Radar', 'AD Tiering', 'Certifications'],
      relatedViolations: ['excessive_privilege', 'sod_conflict', 'tier_breach'],
      assessmentMethod: 'automated',
    },
    {
      id: 'ECC-2-1-3',
      name: 'Privileged Access Management',
      description: 'Manage and monitor privileged access to critical systems.',
      category: 'Identity & Access Management',
      coveredBy: ['AD Tiering', 'Shadow Admin Detection', 'Attack Paths'],
      relatedViolations: ['tier_breach', 'excessive_privilege'],
      assessmentMethod: 'automated',
    },
    {
      id: 'ECC-2-1-4',
      name: 'Authentication',
      description: 'Implement multi-factor authentication for privileged and remote access.',
      category: 'Identity & Access Management',
      coveredBy: ['Identity Explorer (MFA status)', 'Account Browser'],
      relatedViolations: ['missing_mfa'],
      assessmentMethod: 'automated',
    },
    {
      id: 'ECC-2-2-1',
      name: 'Event Logging',
      description: 'Enable and protect event logging for critical systems.',
      category: 'Security Monitoring',
      coveredBy: ['Audit Trail', 'Action Log', 'Event Ingest'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
    {
      id: 'ECC-2-2-2',
      name: 'Security Monitoring',
      description: 'Implement continuous security monitoring.',
      category: 'Security Monitoring',
      coveredBy: ['Threat Detection', 'Cron Jobs', 'Integration Health'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
    {
      id: 'ECC-2-3-1',
      name: 'Vulnerability Management',
      description: 'Identify and remediate vulnerabilities in a timely manner.',
      category: 'Risk Management',
      coveredBy: ['Risk Scorer', 'AI Analysis', 'Remediation Plans'],
      relatedViolations: ['expired_certification', 'password_age'],
      assessmentMethod: 'automated',
    },
    {
      id: 'ECC-2-4-1',
      name: 'Incident Management',
      description: 'Detect, respond to, and recover from cybersecurity incidents.',
      category: 'Incident Response',
      coveredBy: ['Threat Detection', 'Canary Identities', 'Blast Radius'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
    {
      id: 'ECC-2-5-1',
      name: 'Asset Management',
      description: 'Maintain an inventory of organizational assets.',
      category: 'Asset Management',
      coveredBy: ['Identity Explorer', 'NHI Inventory', 'Resource Browser'],
      relatedViolations: ['orphaned_identity'],
      assessmentMethod: 'automated',
    },
    {
      id: 'ECC-2-6-1',
      name: 'Third-Party Security',
      description: 'Manage cybersecurity risks from third-party service providers.',
      category: 'Third-Party Risk',
      coveredBy: ['Supply Chain Risk', 'Integration Health'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
  ],
}

// ─── SAMA Cyber Security Framework (CSF) ────────────────────────────

export const SAMA_CSF: ComplianceFramework = {
  key: 'SAMA_CSF',
  name: 'SAMA CSF',
  fullName: 'Saudi Arabian Monetary Authority - Cyber Security Framework',
  description: 'Cybersecurity framework for financial institutions regulated by SAMA.',
  version: '1.0',
  controls: [
    {
      id: 'SAMA-3-1-1',
      name: 'IAM Policy & Governance',
      description: 'Define and enforce identity and access management policies.',
      category: 'Identity & Access Management',
      coveredBy: ['Policies', 'RBAC Enforcement', 'Certifications'],
      relatedViolations: ['expired_certification'],
      assessmentMethod: 'evidence',
    },
    {
      id: 'SAMA-3-1-2',
      name: 'User Access Provisioning',
      description: 'Manage user access provisioning and de-provisioning.',
      category: 'Identity & Access Management',
      coveredBy: ['Entitlement Radar', 'Certifications', 'Lifecycle Automation'],
      relatedViolations: ['dormant_access', 'orphaned_identity'],
      assessmentMethod: 'automated',
    },
    {
      id: 'SAMA-3-1-3',
      name: 'Privileged Access',
      description: 'Control and monitor privileged access to financial systems.',
      category: 'Identity & Access Management',
      coveredBy: ['AD Tiering', 'Shadow Admin Detection', 'Tier 0 Inventory'],
      relatedViolations: ['tier_breach', 'excessive_privilege'],
      assessmentMethod: 'automated',
    },
    {
      id: 'SAMA-3-1-4',
      name: 'Authentication Controls',
      description: 'Implement strong authentication for all systems.',
      category: 'Identity & Access Management',
      coveredBy: ['Identity Explorer (MFA)', 'Account Browser'],
      relatedViolations: ['missing_mfa'],
      assessmentMethod: 'automated',
    },
    {
      id: 'SAMA-3-1-5',
      name: 'Access Reviews',
      description: 'Conduct periodic access reviews and certifications.',
      category: 'Identity & Access Management',
      coveredBy: ['Certifications', 'Entitlement Radar'],
      relatedViolations: ['expired_certification'],
      assessmentMethod: 'automated',
    },
    {
      id: 'SAMA-3-2-1',
      name: 'Security Event Logging',
      description: 'Log and retain security events for financial systems.',
      category: 'Security Operations',
      coveredBy: ['Audit Trail', 'Event Ingest', 'Action Log'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
    {
      id: 'SAMA-3-2-2',
      name: 'Threat Detection',
      description: 'Implement threat detection and response capabilities.',
      category: 'Security Operations',
      coveredBy: ['Threat Detection', 'Attack Paths', 'Peer Anomaly'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
    {
      id: 'SAMA-3-3-1',
      name: 'Risk Assessment',
      description: 'Conduct regular cybersecurity risk assessments.',
      category: 'Risk Management',
      coveredBy: ['Risk Scorer', 'AI Analysis', 'Remediation Plans'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
  ],
}

// ─── Personal Data Protection Law (PDPL) ────────────────────────────

export const PDPL: ComplianceFramework = {
  key: 'PDPL',
  name: 'PDPL',
  fullName: 'Personal Data Protection Law',
  description: 'Saudi Arabia\'s data protection regulation governing the processing of personal data.',
  version: '2023',
  controls: [
    {
      id: 'PDPL-5',
      name: 'Data Inventory',
      description: 'Maintain a registry of personal data processing activities.',
      category: 'Data Governance',
      coveredBy: ['Identity Explorer', 'Data Quality Dashboard'],
      relatedViolations: ['orphaned_identity'],
      assessmentMethod: 'evidence',
    },
    {
      id: 'PDPL-10',
      name: 'Access Control for Personal Data',
      description: 'Implement access controls to protect personal data.',
      category: 'Access Control',
      coveredBy: ['Entitlement Radar', 'RBAC', 'AD Tiering'],
      relatedViolations: ['excessive_privilege', 'tier_breach'],
      assessmentMethod: 'automated',
    },
    {
      id: 'PDPL-14',
      name: 'Data Minimization',
      description: 'Limit access to personal data to what is necessary.',
      category: 'Data Governance',
      coveredBy: ['Entitlement Radar', 'Certifications', 'Peer Anomaly'],
      relatedViolations: ['excessive_privilege', 'dormant_access'],
      assessmentMethod: 'automated',
    },
    {
      id: 'PDPL-19',
      name: 'Data Breach Notification',
      description: 'Detect and report personal data breaches.',
      category: 'Incident Response',
      coveredBy: ['Threat Detection', 'Canary Identities', 'Webhooks'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
    {
      id: 'PDPL-22',
      name: 'Audit & Accountability',
      description: 'Maintain audit trails for personal data access.',
      category: 'Audit',
      coveredBy: ['Audit Trail', 'Action Log'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
    {
      id: 'PDPL-25',
      name: 'Third-Party Data Sharing',
      description: 'Control and monitor sharing of personal data with third parties.',
      category: 'Third-Party Risk',
      coveredBy: ['Supply Chain Risk', 'Integration Health'],
      relatedViolations: [],
      assessmentMethod: 'evidence',
    },
  ],
}

// ─── Registry ───────────────────────────────────────────────────────

export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [NCA_ECC, SAMA_CSF, PDPL]

export function getFramework(key: string): ComplianceFramework | undefined {
  return COMPLIANCE_FRAMEWORKS.find(f => f.key === key)
}

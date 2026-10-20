/**
 * Centralized IAM glossary used by HelpTooltip and docs/reference/glossary.md.
 * Each key is a snake_case term; the value is a plain-English definition.
 */
export const GLOSSARY: Record<string, string> = {
  tier_violation:
    'A tier violation occurs when an identity classified at a lower tier (e.g., Tier 2) has access to resources at a higher tier (e.g., Tier 0). This creates a privilege escalation risk.',
  nhi:
    'A Non-Human Identity (NHI) represents a machine, application, or service rather than a person. Examples include service accounts, managed identities, API keys, and bot accounts.',
  risk_score:
    'A number from 0-100 computed from 11 weighted factors: tier violations (22), privilege level (15), shadow admin (12), dormancy (10), violation count (10), attack paths (10), MFA status (8), peer anomaly (4), supply chain risk (4), certification status (3), and orphaned NHI status (2).',
  shadow_admin:
    'An identity with admin-equivalent access without being in any recognized admin group. Shadow admins pass access reviews because reviewers only check group memberships.',
  blast_radius:
    "The total scope of resources, identities, and systems that would be compromised if a given identity's credentials were stolen.",
  attack_path:
    'A sequence of steps an attacker could take to escalate from a lower-privileged identity to a higher-privileged target, such as Domain Admin.',
  ad_tier:
    'Active Directory tiering classifies identities and resources into three tiers: Tier 0 (identity plane control - Domain Controllers, AD DS), Tier 1 (server and application control), and Tier 2 (workstation and end-user level).',
  sod:
    'Separation of Duties (SoD) is a governance principle that prevents a single identity from holding conflicting permissions, such as both creating and approving financial transactions.',
  dormant_identity:
    'An active identity that has not authenticated in over 90 days. Dormant accounts increase attack surface because compromised credentials may go unnoticed.',
  orphaned_identity:
    'A non-human identity whose owner has left the organization or been disabled. Orphaned NHIs have no one responsible for credential rotation or access review.',
  entitlement:
    "A permission or access right granted to an identity on a specific resource. Entitlements include role assignments, group memberships, direct permissions, and delegated access.",
  certification:
    "The process of reviewing and confirming that an identity's access rights are still appropriate. Certification campaigns are periodic access reviews required by governance policies.",
  canary_identity:
    'A fake identity (honeypot account) designed to detect attacks. Any authentication attempt against a canary is an immediate indicator of compromise.',
  peer_anomaly:
    'When an identity has significantly more or different entitlements compared to others with the same department, role, and tier classification.',
  kill_chain:
    'A sequence of attack stages: reconnaissance, initial access, credential access, privilege escalation, lateral movement, persistence, exfiltration, and impact.',
  kerberoasting:
    'An attack technique that requests Kerberos service tickets for accounts with SPNs, then cracks the tickets offline to obtain plaintext passwords.',
  dcsync:
    'An attack where a non-domain-controller requests replication of Active Directory data, allowing extraction of all password hashes.',
  golden_ticket:
    'A forged Kerberos TGT that grants unlimited access to any resource in the domain, created by compromising the KRBTGT account hash.',
  impossible_travel:
    'When an identity authenticates from two geographically distant locations within a timeframe that makes physical travel impossible.',
  mfa:
    'Multi-Factor Authentication requires two or more verification methods (something you know, have, or are) to prove identity.',
  rbac:
    'Role-Based Access Control assigns permissions based on roles rather than individual identities. Identity Radar uses 5 roles: viewer, analyst, iam_admin, ciso, admin.',
  rls:
    "Row-Level Security ensures that database queries only return data belonging to the authenticated user's organization.",
  gpo:
    'Group Policy Object — an Active Directory mechanism for applying configuration settings to users and computers. GPO edit permissions can be an attack vector.',
  supply_chain_risk:
    "The risk that a human identity's departure would leave NHIs without an owner, breaking credential rotation and access review processes.",
  data_quality_score:
    'A 0-100 score measuring identity data completeness (40%), freshness (30%), and accuracy (30%). Higher scores indicate more reliable security analysis.',
  effective_tier:
    "The highest AD tier that an identity actually accesses through its entitlements, regardless of its classified tier.",
  remediation_plan:
    'An AI-generated prioritized list of recommended actions to reduce identity risk, including estimated effort, cost, and projected score improvement.',
  ispm:
    "Identity Security Posture Management — continuous assessment of an organization's identity-related security risks and misconfigurations.",
  itdr:
    'Identity Threat Detection and Response — real-time detection of identity-based attacks like credential theft, privilege escalation, and lateral movement.',
  spn:
    'Service Principal Name — a unique identifier for a service instance in Active Directory, used by Kerberos authentication to associate a service with a logon account.',
}

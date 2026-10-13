# Glossary

> Definitions of key IAM and Identity Radar terms.

**AD Tier**
: Active Directory tiering classifies identities and resources into four tiers: Tier 0 (identity plane control - Domain Controllers, AD DS), Top Tier (Tier 0 adjacent - ADFS, Entra Connect, PKI, PAM vaults, DC backup), Tier 1 (server and application control), and Tier 2 (workstation and end-user level).

**Attack Path**
: A sequence of steps an attacker could take to escalate from a lower-privileged identity to a higher-privileged target, such as Domain Admin.

**Blast Radius**
: The total scope of resources, identities, and systems that would be compromised if a given identity's credentials were stolen.

**Canary Identity**
: A fake identity (honeypot account) designed to detect attacks. Any authentication attempt against a canary is an immediate indicator of compromise.

**Certification**
: The process of reviewing and confirming that an identity's access rights are still appropriate. Certification campaigns are periodic access reviews required by governance policies.

**Data Quality Score**
: A 0-100 score measuring identity data completeness (40%), freshness (30%), and accuracy (30%). Higher scores indicate more reliable security analysis.

**DCSync**
: An attack where a non-domain-controller requests replication of Active Directory data, allowing extraction of all password hashes.

**Dormant Identity**
: An active identity that has not authenticated in over 90 days. Dormant accounts increase attack surface because compromised credentials may go unnoticed.

**Effective Tier**
: The highest AD tier that an identity actually accesses through its entitlements, regardless of its classified tier.

**Entitlement**
: A permission or access right granted to an identity on a specific resource. Entitlements include role assignments, group memberships, direct permissions, and delegated access.

**Golden Ticket**
: A forged Kerberos TGT that grants unlimited access to any resource in the domain, created by compromising the KRBTGT account hash.

**GPO (Group Policy Object)**
: An Active Directory mechanism for applying configuration settings to users and computers. GPO edit permissions can be an attack vector.

**Impossible Travel**
: When an identity authenticates from two geographically distant locations within a timeframe that makes physical travel impossible.

**ISPM (Identity Security Posture Management)**
: Continuous assessment of an organization's identity-related security risks and misconfigurations.

**ITDR (Identity Threat Detection and Response)**
: Real-time detection of identity-based attacks like credential theft, privilege escalation, and lateral movement.

**Kerberoasting**
: An attack technique that requests Kerberos service tickets for accounts with SPNs, then cracks the tickets offline to obtain plaintext passwords.

**Kill Chain**
: A sequence of attack stages: reconnaissance, initial access, credential access, privilege escalation, lateral movement, persistence, exfiltration, and impact.

**MFA (Multi-Factor Authentication)**
: Requires two or more verification methods (something you know, have, or are) to prove identity.

**NHI (Non-Human Identity)**
: A machine, application, or service rather than a person. Examples include service accounts, managed identities, API keys, and bot accounts.

**Orphaned Identity**
: A non-human identity whose owner has left the organization or been disabled. Orphaned NHIs have no one responsible for credential rotation or access review.

**Peer Anomaly**
: When an identity has significantly more or different entitlements compared to others with the same department, role, and tier classification.

**RBAC (Role-Based Access Control)**
: Assigns permissions based on roles rather than individual identities. Identity Radar uses 5 roles: viewer, analyst, iam_admin, ciso, admin.

**Remediation Plan**
: An AI-generated prioritized list of recommended actions to reduce identity risk, including estimated effort, cost, and projected score improvement.

**Risk Score**
: A number from 0-100 computed from 11 weighted factors including tier violations, privilege level, shadow admin status, dormancy, violation count, attack paths, MFA status, peer anomaly, supply chain risk, certification status, and orphaned NHI status.

**RLS (Row-Level Security)**
: Ensures that database queries only return data belonging to the authenticated user's organization.

**Shadow Admin**
: An identity with admin-equivalent access without being in any recognized admin group. Shadow admins pass access reviews because reviewers only check group memberships.

**SoD (Separation of Duties)**
: A governance principle that prevents a single identity from holding conflicting permissions, such as both creating and approving financial transactions.

**SPN (Service Principal Name)**
: A unique identifier for a service instance in Active Directory, used by Kerberos authentication to associate a service with a logon account.

**Supply Chain Risk**
: The risk that a human identity's departure would leave NHIs without an owner, breaking credential rotation and access review processes.

**Tier Violation**
: A tier violation occurs when an identity classified at a lower tier (e.g., Tier 2) has access to resources at a higher tier (e.g., Tier 0). This creates a privilege escalation risk.

## Next Steps

- [Risk Scoring Reference](./risk-scoring.md)
- [Tier Classification](./tier-classification.md)
- [RBAC Matrix](./rbac-matrix.md)

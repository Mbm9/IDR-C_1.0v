// Issue catalog — fsProtect-style metadata for every finding type Identity Radar produces.
// Maps a finding type (policy_violations.violationType or exposure_findings.findingType) to a
// stable FSID, severity/exposure scoring, exploitation profile, and mitigation guidance.

export type IssueCategory = 'identity' | 'certificate' | 'gpo' | 'secret'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Certainty = 'confirmed' | 'probable' | 'potential'
export type Privilege = 'any' | 'authenticated' | 'admin'
export type Ease = 'easy' | 'moderate' | 'hard'

export interface MitigationScript { lang: 'powershell' | 'batch'; code: string }
export interface IssueDef {
  fsid: string
  name: string
  category: IssueCategory
  severity: Severity
  impact: string
  mitre: string[] // ATT&CK technique/tactic ids
  certainty: Certainty
  privilege: Privilege
  ease: Ease
  exposurePoints: number // per affected object
  description: string
  mitigation: { summary: string; steps: string[]; script?: MitigationScript }
}

const SEV_POINTS: Record<Severity, number> = { critical: 10, high: 5, medium: 2, low: 1 }

/** Stable FSID for a finding type, e.g. `asrep_roastable` → `FS-ASREP-ROASTABLE`. */
export function fsidForType(type: string): string {
  return `FS-${type.toUpperCase().replace(/_/g, '-')}`
}

function def(type: string, d: Omit<IssueDef, 'fsid' | 'exposurePoints'> & { exposurePoints?: number }): [string, IssueDef] {
  return [type, {
    fsid: fsidForType(type),
    exposurePoints: d.exposurePoints ?? SEV_POINTS[d.severity],
    ...d,
  }]
}

export const ISSUE_CATALOG: Record<string, IssueDef> = Object.fromEntries([
  // ── Identity posture ──
  def('kerberoastable', {
    name: 'Kerberoastable Accounts', category: 'identity', severity: 'high', impact: 'credential_theft',
    mitre: ['T1558.003'], certainty: 'confirmed', privilege: 'authenticated', ease: 'moderate',
    description: 'Service accounts exposing an SPN allow any domain user to request a service ticket and crack it offline.',
    mitigation: {
      summary: 'Use (g)MSAs or enforce long random passwords + AES encryption on SPN accounts.',
      steps: [
        'Identify the affected service accounts and the services that rely on them.',
        'Migrate to Group Managed Service Accounts (gMSA) where possible.',
        'For remaining accounts, set a 25+ character random password and enforce AES-only encryption.',
        'Remove unnecessary SPNs.',
      ],
      script: { lang: 'powershell', code: 'Get-ADUser -Filter {ServicePrincipalName -like "*"} -Properties ServicePrincipalName,msDS-SupportedEncryptionTypes |\n  Set-ADUser -KerberosEncryptionType AES128,AES256' },
    },
  }),
  def('asrep_roastable', {
    name: 'AS-REP Roastable Accounts', category: 'identity', severity: 'high', impact: 'credential_theft',
    mitre: ['T1558.004'], certainty: 'confirmed', privilege: 'any', ease: 'easy',
    description: 'Accounts without Kerberos pre-authentication let an attacker request an AS-REP and crack it offline.',
    mitigation: {
      summary: 'Re-enable Kerberos pre-authentication on all affected accounts.',
      steps: ['Locate accounts with "Do not require Kerberos preauthentication" set.', 'Uncheck the flag (clear DONT_REQ_PREAUTH).', 'Rotate the passwords afterwards.'],
      script: { lang: 'powershell', code: 'Get-ADUser -Filter {DoesNotRequirePreAuth -eq $true} |\n  Set-ADAccountControl -DoesNotRequirePreAuth $false' },
    },
  }),
  def('unconstrained_delegation', {
    name: 'Unconstrained Delegation', category: 'identity', severity: 'critical', impact: 'privilege_escalation',
    mitre: ['T1134.001'], certainty: 'confirmed', privilege: 'admin', ease: 'moderate',
    description: 'Hosts trusted for unconstrained delegation cache TGTs of any authenticating user, enabling full impersonation.',
    mitigation: {
      summary: 'Remove unconstrained delegation; use constrained or RBCD, and protect Tier 0 accounts.',
      steps: ['Identify non-DC computers/users with TRUSTED_FOR_DELEGATION.', 'Switch to constrained delegation or RBCD with explicit targets.', 'Mark sensitive accounts "Account is sensitive and cannot be delegated".'],
      script: { lang: 'powershell', code: 'Set-ADAccountControl -Identity <name> -TrustedForDelegation $false' },
    },
  }),
  def('constrained_delegation', {
    name: 'Constrained / RBCD Delegation', category: 'identity', severity: 'medium', impact: 'privilege_escalation',
    mitre: ['T1134.001'], certainty: 'probable', privilege: 'admin', ease: 'moderate',
    description: 'Constrained delegation (esp. with protocol transition) and RBCD can be abused to impersonate users to target services.',
    mitigation: { summary: 'Review delegation targets; remove protocol transition where unneeded.', steps: ['Audit msDS-AllowedToDelegateTo / RBCD targets.', 'Remove protocol transition (TRUSTED_TO_AUTH_FOR_DELEGATION) where possible.', 'Restrict to the minimum required SPNs.'] },
  }),
  def('reversible_encryption', {
    name: 'Reversible Password Encryption', category: 'identity', severity: 'high', impact: 'credential_theft',
    mitre: ['T1555'], certainty: 'confirmed', privilege: 'admin', ease: 'easy',
    description: 'Passwords stored with reversible encryption can be decrypted to cleartext.',
    mitigation: { summary: 'Disable reversible encryption and reset affected passwords.', steps: ['Clear ENCRYPTED_TEXT_PWD_ALLOWED on accounts and GPOs.', 'Force a password change on affected accounts.'], script: { lang: 'powershell', code: 'Get-ADUser -Filter {AllowReversiblePasswordEncryption -eq $true} |\n  Set-ADUser -AllowReversiblePasswordEncryption $false' } },
  }),
  def('password_not_required', {
    name: 'Password Not Required', category: 'identity', severity: 'high', impact: 'credential_theft',
    mitre: ['T1078'], certainty: 'confirmed', privilege: 'any', ease: 'easy',
    description: 'Accounts with PASSWD_NOTREQD may have empty or trivial passwords.',
    mitigation: { summary: 'Clear the flag and enforce a strong password.', steps: ['Clear PASSWD_NOTREQD.', 'Reset to a strong password.'], script: { lang: 'powershell', code: 'Set-ADAccountControl -Identity <name> -PasswordNotRequired $false' } },
  }),
  def('password_never_expires', {
    name: 'Password Never Expires', category: 'identity', severity: 'low', impact: 'credential_theft',
    mitre: ['T1078'], certainty: 'potential', privilege: 'admin', ease: 'easy',
    description: 'Non-expiring passwords increase the window for credential compromise, especially on privileged accounts.',
    mitigation: { summary: 'Disable "password never expires" on privileged accounts.', steps: ['Identify privileged accounts with DONT_EXPIRE_PASSWORD.', 'Disable the flag and bring under password policy / gMSA.'] },
  }),
  def('stale_privileged_account', {
    name: 'Stale Privileged Accounts', category: 'identity', severity: 'high', impact: 'privilege_escalation',
    mitre: ['T1078.002'], certainty: 'probable', privilege: 'admin', ease: 'easy',
    description: 'AdminSDHolder-protected accounts (adminCount=1) that are dormant/disabled remain attractive, hard-to-monitor targets.',
    mitigation: { summary: 'Remove stale privilege or decommission the account.', steps: ['Confirm the account is no longer needed in a privileged role.', 'Remove from privileged groups and reset adminCount.', 'Disable or delete the account.'] },
  }),
  def('tier_breach', {
    name: 'AD Tiering Violations', category: 'identity', severity: 'critical', impact: 'privilege_escalation',
    mitre: ['T1078.002'], certainty: 'confirmed', privilege: 'admin', ease: 'hard',
    description: 'An identity accesses a stricter tier than it is assigned, collapsing the tiering model.',
    mitigation: { summary: 'Enforce tier separation; remove cross-tier access.', steps: ['Review the cross-tier access path.', 'Remove the offending entitlement/membership.', 'Provision a tier-appropriate account if access is legitimate.'] },
  }),
  def('dormant_access', { name: 'Dormant Accounts with Access', category: 'identity', severity: 'medium', impact: 'lateral_movement', mitre: ['T1078'], certainty: 'potential', privilege: 'any', ease: 'easy', description: 'Inactive accounts that retain access expand the attack surface.', mitigation: { summary: 'Disable dormant accounts and recertify access.', steps: ['Confirm inactivity (>90 days).', 'Disable and schedule for removal.'] } }),
  def('orphaned_identity', { name: 'Orphaned Non-Human Identities', category: 'identity', severity: 'medium', impact: 'persistence', mitre: ['T1078.004'], certainty: 'potential', privilege: 'any', ease: 'moderate', description: 'NHIs without an owner lack accountability and lifecycle management.', mitigation: { summary: 'Assign owners or decommission.', steps: ['Identify orphaned service accounts / app registrations.', 'Assign an accountable owner or remove.'] } }),
  def('missing_mfa', { name: 'Missing MFA', category: 'identity', severity: 'high', impact: 'credential_theft', mitre: ['T1078'], certainty: 'probable', privilege: 'any', ease: 'easy', description: 'Accounts without MFA are vulnerable to credential theft and replay.', mitigation: { summary: 'Enforce MFA, prioritising privileged accounts.', steps: ['Enable MFA / conditional access.', 'Prioritise admins and external users.'] } }),
  def('expired_certification', { name: 'Overdue Access Certifications', category: 'identity', severity: 'medium', impact: 'privilege_escalation', mitre: [], certainty: 'potential', privilege: 'any', ease: 'easy', description: 'Entitlements past their certification date may grant unneeded standing access.', mitigation: { summary: 'Run the certification campaign.', steps: ['Recertify overdue entitlements.', 'Revoke those no longer needed.'] } }),
  def('password_age', { name: 'Stale Passwords', category: 'identity', severity: 'medium', impact: 'credential_theft', mitre: ['T1110'], certainty: 'potential', privilege: 'any', ease: 'easy', description: 'Very old passwords increase exposure to offline cracking and reuse.', mitigation: { summary: 'Rotate stale passwords / adopt gMSA.', steps: ['Identify passwords older than policy.', 'Rotate; migrate service accounts to gMSA.'] } }),
  def('excessive_privilege', { name: 'Excessive Privilege', category: 'identity', severity: 'high', impact: 'privilege_escalation', mitre: ['T1078'], certainty: 'probable', privilege: 'admin', ease: 'moderate', description: 'Identities holding more privilege than their role requires.', mitigation: { summary: 'Right-size access (least privilege).', steps: ['Review entitlements vs peer group.', 'Remove unused privileges.'] } }),
  def('sod_conflict', { name: 'Separation-of-Duties Conflicts', category: 'identity', severity: 'high', impact: 'privilege_escalation', mitre: [], certainty: 'probable', privilege: 'admin', ease: 'moderate', description: 'Toxic entitlement combinations that violate SoD policy.', mitigation: { summary: 'Split conflicting duties across identities.', steps: ['Identify conflicting entitlement pairs.', 'Remove one side or add compensating controls.'] } }),

  // ── Certificate (AD CS / ESC) ──
  def('esc1', { name: 'ESC1 — Misconfigured Certificate Template (SAN)', category: 'certificate', severity: 'critical', impact: 'privilege_escalation', mitre: ['T1649'], certainty: 'confirmed', privilege: 'authenticated', ease: 'moderate', description: 'A template lets low-privileged users supply an arbitrary SAN and obtain an auth certificate — impersonate any user.', mitigation: { summary: 'Remove "supply in request", require manager approval, restrict enrollment.', steps: ['Disable ENROLLEE_SUPPLIES_SUBJECT on the template.', 'Require manager approval / authorized signatures.', 'Restrict Enroll rights to required principals.'] } }),
  def('esc2', { name: 'ESC2 — Any Purpose / No EKU Template', category: 'certificate', severity: 'high', impact: 'privilege_escalation', mitre: ['T1649'], certainty: 'confirmed', privilege: 'authenticated', ease: 'moderate', description: 'Template issues Any-Purpose / No-EKU certificates usable for authentication.', mitigation: { summary: 'Constrain EKUs; restrict enrollment.', steps: ['Set specific EKUs (remove Any Purpose).', 'Add manager approval and restrict Enroll.'] } }),
  def('esc3', { name: 'ESC3 — Enrollment Agent Template', category: 'certificate', severity: 'high', impact: 'privilege_escalation', mitre: ['T1649'], certainty: 'confirmed', privilege: 'authenticated', ease: 'moderate', description: 'Certificate Request Agent EKU available to low-privileged users — enroll on behalf of others.', mitigation: { summary: 'Restrict enrollment agents; enable restrictions on the CA.', steps: ['Limit who can enroll the agent template.', 'Enable enrollment agent restrictions on the CA.'] } }),
  def('esc4', { name: 'ESC4 — Writable Certificate Template', category: 'certificate', severity: 'high', impact: 'privilege_escalation', mitre: ['T1649'], certainty: 'confirmed', privilege: 'authenticated', ease: 'easy', description: 'A template ACL is writable by low-privileged principals, allowing reconfiguration into ESC1.', mitigation: { summary: 'Tighten the template ACL.', steps: ['Remove Write/Owner rights from low-privileged principals.', 'Restrict to PKI admins.'] } }),
  def('esc6', { name: 'ESC6 — EDITF_ATTRIBUTESUBJECTALTNAME2', category: 'certificate', severity: 'critical', impact: 'privilege_escalation', mitre: ['T1649'], certainty: 'confirmed', privilege: 'authenticated', ease: 'easy', description: 'CA flag lets any request carry an arbitrary SAN for authentication.', mitigation: { summary: 'Disable the flag and restart the CA.', steps: ['Run: certutil -setreg policy\\EditFlags -EDITF_ATTRIBUTESUBJECTALTNAME2', 'Restart CertSvc.'], script: { lang: 'batch', code: 'certutil -setreg policy\\EditFlags -EDITF_ATTRIBUTESUBJECTALTNAME2\nnet stop certsvc && net start certsvc' } } }),
  def('esc8', { name: 'ESC8 — HTTP Web Enrollment (NTLM Relay)', category: 'certificate', severity: 'high', impact: 'credential_theft', mitre: ['T1557'], certainty: 'confirmed', privilege: 'any', ease: 'moderate', description: 'HTTP web enrollment enables NTLM relay to obtain authentication certificates.', mitigation: { summary: 'Enforce HTTPS + EPA, or disable web enrollment.', steps: ['Require HTTPS and Extended Protection for Authentication on the enrollment endpoint.', 'Disable NTLM / web enrollment if unused.'] } }),
  def('esc_agent_restrictions', { name: 'CA Enrollment-Agent Restrictions Disabled', category: 'certificate', severity: 'medium', impact: 'privilege_escalation', mitre: ['T1649'], certainty: 'probable', privilege: 'authenticated', ease: 'easy', description: 'No enrollment-agent restrictions — agents can request certificates for any template/principal.', mitigation: { summary: 'Enable enrollment-agent restrictions on the CA.', steps: ['Configure agent restrictions to specific templates/principals.'] } }),

  // ── GPO ──
  def('gpo_dangerous_setting', { name: 'Dangerous GPO Setting', category: 'gpo', severity: 'high', impact: 'privilege_escalation', mitre: [], certainty: 'probable', privilege: 'admin', ease: 'easy', description: 'A GPO sets a known-dangerous value (guest enabled, weak LM level, SMB signing off, etc.).', mitigation: { summary: 'Correct the setting to a secure value.', steps: ['Edit the GPO and set the secure value.', 'Verify via RSoP that it applies.'] } }),
  def('rsop_conflict', { name: 'GPO RSoP Conflict', category: 'gpo', severity: 'medium', impact: 'privilege_escalation', mitre: [], certainty: 'potential', privilege: 'admin', ease: 'moderate', description: 'Multiple GPOs set the same setting to different values on an OU, producing unpredictable effective policy.', mitigation: { summary: 'Resolve conflicting settings; consolidate GPOs.', steps: ['Identify the conflicting GPOs and link order.', 'Consolidate to a single authoritative value.'] } }),
  def('baseline_drift', { name: 'GPO Baseline Drift', category: 'gpo', severity: 'medium', impact: 'privilege_escalation', mitre: [], certainty: 'potential', privilege: 'admin', ease: 'moderate', description: 'Effective OU policy deviates from the approved security baseline.', mitigation: { summary: 'Re-align the OU to baseline.', steps: ['Compare effective settings to baseline.', 'Correct drifted settings.'] } }),

  // ── Secrets ──
  def('gpp_cpassword', { name: 'GPP cpassword in SYSVOL', category: 'secret', severity: 'critical', impact: 'credential_theft', mitre: ['T1552.006'], certainty: 'confirmed', privilege: 'any', ease: 'easy', description: 'Group Policy Preferences cpassword is encrypted with a public Microsoft key — effectively cleartext.', mitigation: { summary: 'Remove GPP passwords from SYSVOL and rotate them.', steps: ['Delete the affected GPP XML files from SYSVOL.', 'Rotate every exposed credential.', 'Use LAPS for local admin passwords.'], script: { lang: 'powershell', code: 'Get-ChildItem \\\\$env:USERDNSDOMAIN\\SYSVOL -Recurse -Include *.xml |\n  Select-String -Pattern "cpassword"' } } }),
  def('cleartext_password', { name: 'Cleartext Password in Share', category: 'secret', severity: 'high', impact: 'credential_theft', mitre: ['T1552.001'], certainty: 'confirmed', privilege: 'any', ease: 'moderate', description: 'A password is stored in cleartext in a shared file.', mitigation: { summary: 'Remove and rotate the credential; restrict the share.', steps: ['Remove the secret from the file.', 'Rotate the credential.', 'Restrict share permissions; use a secrets vault.'] } }),
  def('connection_string_secret', { name: 'Credential in Connection String', category: 'secret', severity: 'high', impact: 'credential_theft', mitre: ['T1552.001'], certainty: 'confirmed', privilege: 'any', ease: 'moderate', description: 'A connection string embeds credentials in a shared file.', mitigation: { summary: 'Move to integrated auth or a vault; rotate.', steps: ['Replace embedded creds with integrated auth or a vault reference.', 'Rotate the credential.'] } }),
  def('script_credential', { name: 'Credential in Logon Script', category: 'secret', severity: 'medium', impact: 'credential_theft', mitre: ['T1552.001'], certainty: 'probable', privilege: 'any', ease: 'moderate', description: 'A credential is passed on a command line in a logon script.', mitigation: { summary: 'Remove the credential from the script.', steps: ['Remove the credential.', 'Use gMSA / scheduled-task stored credentials instead.'] } }),
  def('private_key', { name: 'Private Key in Share', category: 'secret', severity: 'high', impact: 'credential_theft', mitre: ['T1552.004'], certainty: 'confirmed', privilege: 'any', ease: 'moderate', description: 'Private key material is stored in a shared location.', mitigation: { summary: 'Remove and rotate the key; restrict the share.', steps: ['Remove the key file.', 'Reissue/rotate the key.', 'Restrict share access.'] } }),
])

const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 }

/** Text used for finding types that have no catalog entry (see getIssueDef). */
export const GENERIC_ISSUE_TEXT = {
  description: 'Detected security finding.',
  summary: 'Review and remediate the affected objects.',
} as const

/** Catalog entry for a finding type, or a sensible default. */
export function getIssueDef(type: string, fallback?: { severity?: Severity; category?: IssueCategory; impact?: string }): IssueDef {
  const hit = ISSUE_CATALOG[type]
  if (hit) return hit
  const severity = fallback?.severity ?? 'medium'
  return {
    fsid: fsidForType(type),
    name: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    category: fallback?.category ?? 'identity', severity, impact: fallback?.impact ?? 'privilege_escalation',
    mitre: [], certainty: 'potential', privilege: 'any', ease: 'moderate', exposurePoints: SEV_POINTS[severity],
    description: GENERIC_ISSUE_TEXT.description, mitigation: { summary: GENERIC_ISSUE_TEXT.summary, steps: [] },
  }
}

export { SEV_RANK }

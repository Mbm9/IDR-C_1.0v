// Static AD security posture / exposure checks.
//
// Unlike the runtime ITDR detectors in `lib/itdr/detectors.ts` (which look at recent
// identity *events*), these checks evaluate the *current state* of an identity to surface
// configuration-level exposures — the named AD weaknesses (Kerberoasting, AS-REP roasting,
// unconstrained delegation, etc.) that an attacker enumerates before exploiting.
//
// Each check is a pure function over a single identity. Findings are emitted as
// `policy_violations` by the ad-exposure-scanner cron.

import type { AdSecurity } from '@/lib/connectors/base'
import { isControlPlaneTier } from '@/lib/utils/tiers'

// ── userAccountControl bit flags ──
export const UAC = {
  ACCOUNTDISABLE: 0x0002,
  PASSWD_NOTREQD: 0x0020,
  ENCRYPTED_TEXT_PWD_ALLOWED: 0x0080, // reversible encryption
  DONT_EXPIRE_PASSWORD: 0x10000,
  TRUSTED_FOR_DELEGATION: 0x80000, // unconstrained delegation
  DONT_REQ_PREAUTH: 0x400000, // AS-REP roastable
  TRUSTED_TO_AUTH_FOR_DELEGATION: 0x1000000, // constrained delegation w/ protocol transition
} as const

export function hasFlag(uac: number | undefined | null, flag: number): boolean {
  return !!uac && (uac & flag) === flag
}

// Impact categories — mirror fsProtect's "Impacts" attack-vector grouping.
export type ImpactCategory =
  | 'credential_theft'
  | 'privilege_escalation'
  | 'lateral_movement'
  | 'persistence'

export type Severity = 'critical' | 'high' | 'medium' | 'low'

// Violation types this module can produce (subset of violationTypeEnum).
export type PostureViolationType =
  | 'kerberoastable'
  | 'asrep_roastable'
  | 'unconstrained_delegation'
  | 'constrained_delegation'
  | 'reversible_encryption'
  | 'password_not_required'
  | 'password_never_expires'
  | 'stale_privileged_account'

export interface PostureIdentity {
  id: string
  displayName: string
  adTier: string | null
  subType: string
  status: string
  passwordLastSetAt: Date | null
  adSecurity: AdSecurity | null
}

export interface PostureFinding {
  identityId: string
  violationType: PostureViolationType
  severity: Severity
  impact: ImpactCategory
  summary: string
  evidence: Record<string, unknown>
}

// ── Helpers ──

function isPrivileged(identity: PostureIdentity): boolean {
  return isControlPlaneTier(identity.adTier) || (identity.adSecurity?.adminCount ?? 0) >= 1
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

function passwordStale(identity: PostureIdentity): boolean {
  if (!identity.passwordLastSetAt) return false
  return Date.now() - identity.passwordLastSetAt.getTime() > ONE_YEAR_MS
}

// ── Checks ──

type CheckFn = (identity: PostureIdentity) => PostureFinding | null

// 1. Kerberoastable — a (person) account exposing a servicePrincipalName.
//    Its TGS can be requested by any domain user and cracked offline.
const kerberoastableCheck: CheckFn = (identity) => {
  const spn = identity.adSecurity?.spn ?? []
  if (spn.length === 0) return null
  // Computer/machine accounts always carry host/ SPNs but have 120-char random
  // machine passwords rotated by the DC — they are NOT Kerberoastable. Only flag
  // person/service accounts (avoids one false positive per domain-joined machine).
  if (identity.subType === 'computer' || identity.subType === 'machine') return null
  const priv = isPrivileged(identity)
  const stale = passwordStale(identity)
  return {
    identityId: identity.id,
    violationType: 'kerberoastable',
    severity: priv ? 'critical' : stale ? 'high' : 'medium',
    impact: 'credential_theft',
    summary: `Service account "${identity.displayName}" exposes ${spn.length} SPN(s) and is Kerberoastable${priv ? ' (privileged)' : ''}${stale ? ' with a stale password (>1yr)' : ''}.`,
    evidence: { spn, privileged: priv, passwordStale: stale, mitre: 'T1558.003' },
  }
}

// 2. AS-REP roastable — Kerberos pre-authentication not required (DONT_REQ_PREAUTH).
const asrepRoastableCheck: CheckFn = (identity) => {
  if (!hasFlag(identity.adSecurity?.uac, UAC.DONT_REQ_PREAUTH)) return null
  const priv = isPrivileged(identity)
  return {
    identityId: identity.id,
    violationType: 'asrep_roastable',
    severity: priv ? 'critical' : 'high',
    impact: 'credential_theft',
    summary: `"${identity.displayName}" does not require Kerberos pre-authentication and is AS-REP roastable.`,
    evidence: { uac: identity.adSecurity?.uac, privileged: priv, mitre: 'T1558.004' },
  }
}

// 3. Unconstrained delegation — TRUSTED_FOR_DELEGATION lets the host impersonate any
//    user that authenticates to it. Critical on anything that is not a domain controller.
const unconstrainedDelegationCheck: CheckFn = (identity) => {
  if (!hasFlag(identity.adSecurity?.uac, UAC.TRUSTED_FOR_DELEGATION)) return null
  return {
    identityId: identity.id,
    violationType: 'unconstrained_delegation',
    severity: 'critical',
    impact: 'privilege_escalation',
    summary: `"${identity.displayName}" is trusted for unconstrained delegation — it can impersonate any authenticating identity.`,
    evidence: { uac: identity.adSecurity?.uac, mitre: 'T1134.001' },
  }
}

// 4. Constrained / resource-based constrained delegation (RBCD).
const constrainedDelegationCheck: CheckFn = (identity) => {
  const targets = identity.adSecurity?.allowedToDelegateTo ?? []
  const rbcd = identity.adSecurity?.rbcd ?? false
  const protocolTransition = hasFlag(identity.adSecurity?.uac, UAC.TRUSTED_TO_AUTH_FOR_DELEGATION)
  if (targets.length === 0 && !rbcd && !protocolTransition) return null
  return {
    identityId: identity.id,
    violationType: 'constrained_delegation',
    severity: protocolTransition ? 'high' : 'medium',
    impact: 'privilege_escalation',
    summary: `"${identity.displayName}" is configured for constrained delegation${rbcd ? ' (resource-based)' : ''}${protocolTransition ? ' with protocol transition' : ''} to ${targets.length} target(s).`,
    evidence: { allowedToDelegateTo: targets, rbcd, protocolTransition, mitre: 'T1134.001' },
  }
}

// 5. Reversible encryption — password stored with reversible encryption (recoverable plaintext).
const reversibleEncryptionCheck: CheckFn = (identity) => {
  if (!hasFlag(identity.adSecurity?.uac, UAC.ENCRYPTED_TEXT_PWD_ALLOWED)) return null
  return {
    identityId: identity.id,
    violationType: 'reversible_encryption',
    severity: 'high',
    impact: 'credential_theft',
    summary: `"${identity.displayName}" stores its password using reversible encryption — the cleartext is recoverable.`,
    evidence: { uac: identity.adSecurity?.uac, mitre: 'T1555' },
  }
}

// 6. Password not required — PASSWD_NOTREQD allows a blank/empty password.
const passwordNotRequiredCheck: CheckFn = (identity) => {
  if (!hasFlag(identity.adSecurity?.uac, UAC.PASSWD_NOTREQD)) return null
  return {
    identityId: identity.id,
    violationType: 'password_not_required',
    severity: isPrivileged(identity) ? 'critical' : 'high',
    impact: 'credential_theft',
    summary: `"${identity.displayName}" does not require a password (PASSWD_NOTREQD).`,
    evidence: { uac: identity.adSecurity?.uac, mitre: 'T1078' },
  }
}

// 7. Password never expires — DONT_EXPIRE_PASSWORD. Higher risk on privileged accounts.
const passwordNeverExpiresCheck: CheckFn = (identity) => {
  if (!hasFlag(identity.adSecurity?.uac, UAC.DONT_EXPIRE_PASSWORD)) return null
  const priv = isPrivileged(identity)
  return {
    identityId: identity.id,
    violationType: 'password_never_expires',
    severity: priv ? 'high' : 'low',
    impact: 'credential_theft',
    summary: `"${identity.displayName}" has a non-expiring password${priv ? ' on a privileged account' : ''}.`,
    evidence: { uac: identity.adSecurity?.uac, privileged: priv, mitre: 'T1078' },
  }
}

// 8. Stale privileged account — adminCount=1 (AdminSDHolder-protected) but dormant/disabled.
const stalePrivilegedCheck: CheckFn = (identity) => {
  const adminProtected = (identity.adSecurity?.adminCount ?? 0) >= 1
  const inactive = ['dormant', 'disabled', 'inactive', 'orphaned'].includes(identity.status)
  if (!adminProtected || !inactive) return null
  return {
    identityId: identity.id,
    violationType: 'stale_privileged_account',
    severity: 'high',
    impact: 'privilege_escalation',
    summary: `"${identity.displayName}" is AdminSDHolder-protected (adminCount=1) but is ${identity.status} — a dormant privileged account.`,
    evidence: { adminCount: identity.adSecurity?.adminCount, status: identity.status, mitre: 'T1078.002' },
  }
}

export const POSTURE_CHECKS: CheckFn[] = [
  kerberoastableCheck,
  asrepRoastableCheck,
  unconstrainedDelegationCheck,
  constrainedDelegationCheck,
  reversibleEncryptionCheck,
  passwordNotRequiredCheck,
  passwordNeverExpiresCheck,
  stalePrivilegedCheck,
]

/** Run every posture check against the given identities and return all findings. */
export function runPostureChecks(identities: PostureIdentity[]): PostureFinding[] {
  const findings: PostureFinding[] = []
  for (const identity of identities) {
    if (!identity.adSecurity) continue
    for (const check of POSTURE_CHECKS) {
      const finding = check(identity)
      if (finding) findings.push(finding)
    }
  }
  return findings
}

/** Map a violation type to its impact category (for aggregation when reading from the DB). */
export const VIOLATION_IMPACT: Record<PostureViolationType, ImpactCategory> = {
  kerberoastable: 'credential_theft',
  asrep_roastable: 'credential_theft',
  reversible_encryption: 'credential_theft',
  password_not_required: 'credential_theft',
  password_never_expires: 'credential_theft',
  unconstrained_delegation: 'privilege_escalation',
  constrained_delegation: 'privilege_escalation',
  stale_privileged_account: 'privilege_escalation',
}

/**
 * GPO-to-account validation and internal policy compliance.
 *
 * Pure evaluation (no I/O) so the report API, the generated documents and the
 * tests all share one source of truth; `loadGpoValidationInput` is the only
 * database access. Findings carry a stable `check` key and plain data; display
 * text is produced by the UI from messages (EN/AR), never stored here.
 *
 * Tier rank (lib/utils/tiers): tier_0 is the most privileged (rank 0), then
 * tier_top, tier_1, tier_2. A trustee "below" a GPO has a higher rank number
 * than the GPO. Top Tier (Tier 0 adjacent) is control plane: findings that a
 * lower tier can change or reach it carry Tier 0 severity.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  gpoObjects, gpoLinks, gpoPermissions, gpoBaselines, identities, groups,
  groupMemberships, accounts, policies, policyViolations,
} from '@/lib/db/schema'
import { checkDangerousSettings } from '@/lib/itdr/gpo-audit'
import { TIER_RANK as RANK, isControlPlaneTier, type AdTier } from '@/lib/utils/tiers'

export type Tier = AdTier
export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type CheckKey =
  | 'edit_right_below_tier'      // account/group can change a GPO of a more privileged tier
  | 'tier0_admin_on_lower_tier'  // Tier 0 account administers a Tier 1/2 GPO (credential exposure)
  | 'inactive_trustee'           // dormant / disabled / orphaned / long-unused account holds edit rights
  | 'trustee_without_mfa'        // human account with edit rights has no MFA-enabled account
  | 'link_tier_inversion'        // lower-tier GPO applies to a higher-tier OU
  | 'link_scope_mismatch'        // higher-tier GPO linked to a lower-tier OU
  | 'gpp_password'               // Group Policy Preferences cpassword (MS14-025)
  | 'insecure_setting'           // dangerous security setting value
  | 'baseline_drift'             // setting weaker than the approved baseline
  | 'gpo_without_owner'          // no accountable owner

export interface Finding {
  id: string
  check: CheckKey
  severity: Severity
  gpoId: string
  gpoName: string
  gpoTier: Tier
  /** Account or group the finding is about, when there is one. */
  trustee?: { kind: 'identity' | 'group'; id: string; name: string; tier: Tier; memberCount?: number }
  permission?: string
  ou?: { dn: string; tier: Tier }
  /** Facts behind the finding (status, last logon, setting name/expected/actual). Never secret values. */
  evidence: Record<string, string | number | boolean | null>
  /** Framework controls the finding bears on (ids from lib/compliance/frameworks.ts). */
  controls: string[]
}

export interface GpoInputRow {
  id: string; name: string; adTier: Tier; status: string; ownerIdentityId: string | null
  settings: Record<string, string> | null
}
export interface PermissionInputRow {
  gpoId: string; trusteeIdentityId: string | null; trusteeGroupId: string | null
  trusteeName: string; permissionType: string
}
export interface IdentityInputRow {
  id: string; displayName: string; type: string; status: string; adTier: Tier
  lastLogonAt: Date | null; ownerIdentityId: string | null; mfa: boolean
  passwordLastSetAt?: Date | null; tierViolation?: boolean
}
export interface GroupInputRow { id: string; name: string; adTier: Tier; memberCount: number }
export interface LinkInputRow {
  gpoId: string; linkedOu: string; linkOrder: number; enforced: boolean; linkEnabled: boolean; adTierOfOu: Tier
}
export interface BaselineInputRow { name: string; scope: string; adTier: Tier; settings: Record<string, string> }
export interface PolicyInputRow {
  id: string; name: string; type: string; severity: Severity; enabled: boolean
  definition: Record<string, unknown>; frameworkMappings: Record<string, string[]>
}
export interface ViolationInputRow { policyId: string; identityId: string; status: string }

export interface ValidationInput {
  gpos: GpoInputRow[]
  permissions: PermissionInputRow[]
  identities: IdentityInputRow[]
  groups: GroupInputRow[]
  links: LinkInputRow[]
  baselines: BaselineInputRow[]
  policies: PolicyInputRow[]
  violations: ViolationInputRow[]
  now?: Date
}

/** Permissions that let the trustee change what a GPO does or where it applies. */
export const EDIT_PERMISSIONS = new Set(['edit_settings', 'modify_security', 'full_control', 'link_gpo'])
export const INACTIVITY_DAYS = 90

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const CONTROLS: Record<CheckKey, string[]> = {
  edit_right_below_tier: ['ECC-2-1-3', 'SAMA-3-1-3', 'PDPL-10'],
  tier0_admin_on_lower_tier: ['ECC-2-1-3', 'SAMA-3-1-3'],
  inactive_trustee: ['ECC-2-1-1', 'SAMA-3-1-5'],
  trustee_without_mfa: ['ECC-2-1-4', 'SAMA-3-1-4'],
  link_tier_inversion: ['ECC-2-1-3', 'SAMA-3-1-3'],
  link_scope_mismatch: ['ECC-2-5-1'],
  gpp_password: ['ECC-2-1-4', 'ECC-2-3-1', 'SAMA-3-3-1'],
  insecure_setting: ['ECC-2-3-1', 'SAMA-3-3-1'],
  baseline_drift: ['ECC-2-3-1', 'SAMA-3-3-1'],
  gpo_without_owner: ['ECC-2-5-1', 'SAMA-3-1-1'],
}

const isInactive = (i: IdentityInputRow, now: Date) => {
  if (['dormant', 'disabled', 'inactive', 'orphaned', 'suspended'].includes(i.status)) return true
  if (!i.lastLogonAt) return true
  return now.getTime() - i.lastLogonAt.getTime() > INACTIVITY_DAYS * 86_400_000
}

const daysSince = (d: Date | null, now: Date) => (d ? Math.floor((now.getTime() - d.getTime()) / 86_400_000) : null)

export function evaluateGpoFindings(input: ValidationInput): Finding[] {
  const now = input.now ?? new Date()
  const idById = new Map(input.identities.map((i) => [i.id, i]))
  const groupById = new Map(input.groups.map((g) => [g.id, g]))
  const findings: Finding[] = []
  let seq = 0
  const push = (f: Omit<Finding, 'id' | 'controls'>) =>
    findings.push({ ...f, id: `F-${String(++seq).padStart(3, '0')}`, controls: CONTROLS[f.check] })

  const gpoById = new Map(input.gpos.map((g) => [g.id, g]))

  // ── Permissions vs trustee tier and state ──
  for (const p of input.permissions) {
    const gpo = gpoById.get(p.gpoId)
    if (!gpo || !EDIT_PERMISSIONS.has(p.permissionType)) continue
    const ident = p.trusteeIdentityId ? idById.get(p.trusteeIdentityId) : undefined
    const group = p.trusteeGroupId ? groupById.get(p.trusteeGroupId) : undefined
    const trustee = ident
      ? { kind: 'identity' as const, id: ident.id, name: ident.displayName, tier: ident.adTier }
      : group
        ? { kind: 'group' as const, id: group.id, name: group.name, tier: group.adTier, memberCount: group.memberCount }
        : null
    if (!trustee) continue
    const base = { gpoId: gpo.id, gpoName: gpo.name, gpoTier: gpo.adTier, trustee, permission: p.permissionType }

    if (RANK[trustee.tier] > RANK[gpo.adTier]) {
      push({
        ...base, check: 'edit_right_below_tier',
        severity: isControlPlaneTier(gpo.adTier) ? 'critical' : 'high',
        evidence: { trusteeTier: trustee.tier, gpoTier: gpo.adTier, ...(group ? { members: group.memberCount } : {}) },
      })
    } else if (trustee.tier === 'tier_0' && !isControlPlaneTier(gpo.adTier) && gpo.adTier !== 'unclassified') {
      // A Top Tier GPO is not an exposure: owning it already owns Tier 0.
      push({ ...base, check: 'tier0_admin_on_lower_tier', severity: 'medium', evidence: { trusteeTier: trustee.tier, gpoTier: gpo.adTier } })
    }

    if (ident) {
      if (isInactive(ident, now)) {
        push({
          ...base, check: 'inactive_trustee',
          severity: isControlPlaneTier(gpo.adTier) ? 'high' : 'medium',
          evidence: { status: ident.status, daysSinceLogon: daysSince(ident.lastLogonAt, now) },
        })
      }
      if (ident.type === 'human' && !ident.mfa) {
        push({
          ...base, check: 'trustee_without_mfa',
          severity: isControlPlaneTier(gpo.adTier) ? 'high' : 'medium',
          evidence: { mfa: false },
        })
      }
    }
  }

  // ── Links vs OU tier ──
  for (const l of input.links) {
    const gpo = gpoById.get(l.gpoId)
    if (!gpo || !l.linkEnabled || gpo.status === 'disabled') continue
    if (gpo.adTier === 'unclassified' || l.adTierOfOu === 'unclassified') continue
    const ou = { dn: l.linkedOu, tier: l.adTierOfOu }
    if (RANK[gpo.adTier] > RANK[l.adTierOfOu]) {
      push({
        gpoId: gpo.id, gpoName: gpo.name, gpoTier: gpo.adTier, ou, check: 'link_tier_inversion',
        severity: isControlPlaneTier(l.adTierOfOu) ? 'critical' : 'high',
        evidence: { gpoTier: gpo.adTier, ouTier: l.adTierOfOu, enforced: l.enforced },
      })
    } else if (RANK[gpo.adTier] < RANK[l.adTierOfOu]) {
      push({
        gpoId: gpo.id, gpoName: gpo.name, gpoTier: gpo.adTier, ou, check: 'link_scope_mismatch', severity: 'low',
        evidence: { gpoTier: gpo.adTier, ouTier: l.adTierOfOu },
      })
    }
  }

  // ── Settings: GPP passwords, dangerous values, baseline drift ──
  for (const g of input.gpos) {
    if (g.settings && Object.keys(g.settings).some((k) => k.toLowerCase() === 'cpassword')) {
      push({
        gpoId: g.id, gpoName: g.name, gpoTier: g.adTier, check: 'gpp_password', severity: 'critical',
        evidence: { setting: 'cpassword', reference: 'MS14-025' },
      })
    }
  }
  // Dangerous values (shared rules with the Exposures scanner), one finding per setting.
  const dangerous = checkDangerousSettings(
    input.gpos.map((g) => ({ id: g.id, name: g.name, adTier: g.adTier, settings: g.settings })),
  )
  const gpoByName = new Map(input.gpos.map((g) => [g.name, g]))
  const flagged = new Set<string>()
  for (const f of dangerous) {
    const gpo = gpoByName.get(f.subjectName)
    if (!gpo) continue
    const ev = f.evidence as { setting?: string; value?: unknown }
    flagged.add(`${gpo.id}|${ev.setting}`)
    push({
      gpoId: gpo.id, gpoName: gpo.name, gpoTier: gpo.adTier, check: 'insecure_setting',
      severity: f.severity as Severity,
      evidence: { setting: String(ev.setting ?? ''), actual: ev.value != null ? String(ev.value) : null },
    })
  }

  // Baseline drift, per GPO: each setting the GPO sets is compared with the
  // approved baseline for every tier the GPO is linked to (falling back to
  // the Domain baseline, e.g. a Top Tier OU with no tier_top baseline). Settings
  // already reported as dangerous are skipped.
  for (const g of input.gpos) {
    if (!g.settings || g.status === 'disabled') continue
    const tiers = new Set(input.links.filter((l) => l.gpoId === g.id && l.linkEnabled).map((l) => l.adTierOfOu))
    const seen = new Set<string>()
    for (const tier of tiers) {
      const baseline = input.baselines.find((b) => b.adTier === tier) ?? input.baselines.find((b) => b.scope === 'Domain')
      if (!baseline) continue
      for (const [key, actual] of Object.entries(g.settings)) {
        if (key.toLowerCase() === 'cpassword' || flagged.has(`${g.id}|${key}`)) continue
        const expected = baseline.settings[key]
        if (expected === undefined || seen.has(key)) continue
        if (String(actual).toLowerCase() === String(expected).toLowerCase()) continue
        seen.add(key)
        push({
          gpoId: g.id, gpoName: g.name, gpoTier: g.adTier, check: 'baseline_drift',
          severity: isControlPlaneTier(g.adTier) || isControlPlaneTier(tier) ? 'high' : 'medium',
          evidence: { setting: key, actual: String(actual), expected: String(expected), baseline: baseline.name },
        })
      }
    }
  }

  // ── Ownership ──
  for (const g of input.gpos) {
    if (!g.ownerIdentityId) {
      push({
        gpoId: g.id, gpoName: g.name, gpoTier: g.adTier, check: 'gpo_without_owner',
        severity: isControlPlaneTier(g.adTier) ? 'medium' : 'low', evidence: {},
      })
    }
  }

  return findings.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || RANK[a.gpoTier] - RANK[b.gpoTier] || a.gpoName.localeCompare(b.gpoName))
}

// ── Per-GPO view ──

export interface GpoStatusRow {
  gpoId: string; name: string; tier: Tier; status: string
  editors: number; findings: number; worst: Severity | null; compliant: boolean
}

export function gpoStatusRows(input: ValidationInput, findings: Finding[]): GpoStatusRow[] {
  return input.gpos.map((g) => {
    const fs = findings.filter((f) => f.gpoId === g.id)
    const worst = fs.reduce<Severity | null>((w, f) => (w === null || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[w] ? f.severity : w), null)
    return {
      gpoId: g.id, name: g.name, tier: g.adTier, status: g.status,
      editors: input.permissions.filter((p) => p.gpoId === g.id && EDIT_PERMISSIONS.has(p.permissionType)).length,
      findings: fs.length, worst,
      // Compliant = nothing critical or high against this GPO.
      compliant: !fs.some((f) => f.severity === 'critical' || f.severity === 'high'),
    }
  }).sort((a, b) => RANK[a.tier] - RANK[b.tier] || a.name.localeCompare(b.name))
}

// ── Trustee validation matrix: one row per edit-capable permission ──

export interface TrusteeRow {
  gpoName: string; gpoTier: Tier; trusteeName: string; trusteeKind: 'identity' | 'group'
  trusteeTier: Tier; permission: string; status: string | null; daysSinceLogon: number | null
  mfa: boolean | null; checks: CheckKey[]; valid: boolean
}

export function trusteeRows(input: ValidationInput, findings: Finding[]): TrusteeRow[] {
  const now = input.now ?? new Date()
  const idById = new Map(input.identities.map((i) => [i.id, i]))
  const groupById = new Map(input.groups.map((g) => [g.id, g]))
  const gpoById = new Map(input.gpos.map((g) => [g.id, g]))
  const rows: TrusteeRow[] = []
  for (const p of input.permissions) {
    const gpo = gpoById.get(p.gpoId)
    if (!gpo || !EDIT_PERMISSIONS.has(p.permissionType)) continue
    const ident = p.trusteeIdentityId ? idById.get(p.trusteeIdentityId) : undefined
    const group = p.trusteeGroupId ? groupById.get(p.trusteeGroupId) : undefined
    const trusteeId = ident?.id ?? group?.id
    if (!trusteeId) continue
    const checks = findings
      .filter((f) => f.gpoId === gpo.id && f.trustee?.id === trusteeId && f.permission === p.permissionType)
      .map((f) => f.check)
    rows.push({
      gpoName: gpo.name, gpoTier: gpo.adTier, trusteeName: ident?.displayName ?? group!.name,
      trusteeKind: ident ? 'identity' : 'group', trusteeTier: ident?.adTier ?? group!.adTier,
      permission: p.permissionType, status: ident?.status ?? null,
      daysSinceLogon: ident ? daysSince(ident.lastLogonAt, now) : null,
      mfa: ident ? ident.mfa : null, checks,
      valid: !checks.some((c) => c !== 'tier0_admin_on_lower_tier'),
    })
  }
  return rows.sort((a, b) => Number(a.valid) - Number(b.valid) || RANK[a.gpoTier] - RANK[b.gpoTier] || a.gpoName.localeCompare(b.gpoName))
}

// ── Internal policy compliance ──

export interface PolicyComplianceRow {
  policyId: string; name: string; type: string; severity: Severity; enabled: boolean
  scope: 'all' | 'human' | 'non_human' | 'tier_0'
  inScope: number
  /** Identities with an open violation recorded by the detection jobs. */
  recordedNonCompliant: number
  /** Identities failing the policy when measured directly from identity data; null = not measurable. */
  measuredNonCompliant: number | null
  /** Union of recorded and measured: what compliance is computed from (the stricter view). */
  nonCompliant: number
  /** Measured failures with no recorded violation: the detection pipeline is missing them. */
  unrecorded: number
  exceptions: number; compliancePct: number
  frameworks: Record<string, string[]>
}

function policyScope(p: PolicyInputRow): PolicyComplianceRow['scope'] {
  const scope = String(p.definition?.scope ?? '')
  if (scope === 'tier_0') return 'tier_0'
  if (scope === 'non_human') return 'non_human'
  if (scope === 'all_users') return 'human'
  if (p.type === 'password_policy') return 'human' // passwords age only for interactive accounts here
  return 'all'
}

/**
 * Measure a policy directly from identity data where its definition allows,
 * independently of the detection jobs. Returns the failing identity ids, or
 * null when the policy cannot be measured from the data held here (SoD,
 * certification, excess privilege and AD posture rely on their scanners).
 */
export function measurePolicy(p: PolicyInputRow, population: IdentityInputRow[], now: Date): Set<string> | null {
  const def = p.definition ?? {}
  const days = (d: Date | null | undefined) => (d ? (now.getTime() - d.getTime()) / 86_400_000 : Infinity)
  const ids = (pred: (i: IdentityInputRow) => boolean) => new Set(population.filter(pred).map((i) => i.id))
  switch (p.type) {
    case 'mfa_policy':
      if (def.require_mfa !== true) return null
      // MFA applies to people; service accounts authenticate non-interactively.
      return ids((i) => i.type === 'human' && i.status !== 'disabled' && !i.mfa)
    case 'lifecycle_policy':
      if (typeof def.inactivity_days === 'number') {
        const n = def.inactivity_days
        return ids((i) => i.status === 'active' && days(i.lastLogonAt) > n)
      }
      if (def.require_owner === true) return ids((i) => i.type === 'non_human' && !i.ownerIdentityId)
      return null
    case 'password_policy':
      if (typeof def.max_age_days !== 'number') return null
      return ids((i) => i.type === 'human' && i.status !== 'disabled' && i.passwordLastSetAt !== undefined && days(i.passwordLastSetAt) > (def.max_age_days as number))
    case 'tiering_rule':
      return ids((i) => i.tierViolation === true)
    default:
      return null
  }
}

export function evaluatePolicyCompliance(input: ValidationInput): PolicyComplianceRow[] {
  const now = input.now ?? new Date()
  return input.policies.map((p) => {
    const scope = policyScope(p)
    const population = input.identities.filter((i) =>
      scope === 'all' ? true : scope === 'tier_0' ? i.adTier === 'tier_0' : i.type === scope)
    const vs = input.violations.filter((v) => v.policyId === p.id)
    const recorded = new Set(vs.filter((v) => v.status === 'open').map((v) => v.identityId))
    const excepted = new Set(vs.filter((v) => v.status === 'excepted').map((v) => v.identityId))
    const measured = measurePolicy(p, population, now)
    // An approved exception covers a measured failure too.
    const measuredOpen = measured ? new Set([...measured].filter((id) => !excepted.has(id))) : null
    const failing = new Set([...recorded, ...(measuredOpen ?? [])])
    // A recorded violation outside the declared scope still counts: widen the population.
    const inScope = new Set([...population.map((i) => i.id), ...failing]).size
    return {
      policyId: p.id, name: p.name, type: p.type, severity: p.severity, enabled: p.enabled, scope,
      inScope,
      recordedNonCompliant: recorded.size,
      measuredNonCompliant: measuredOpen ? measuredOpen.size : null,
      nonCompliant: failing.size,
      unrecorded: measuredOpen ? [...measuredOpen].filter((id) => !recorded.has(id)).length : 0,
      exceptions: excepted.size,
      compliancePct: inScope === 0 ? 100 : Math.round(((inScope - failing.size) / inScope) * 1000) / 10,
      frameworks: p.frameworkMappings ?? {},
    }
  }).sort((a, b) => a.compliancePct - b.compliancePct || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// ── Whole report ──

export interface GpoValidationReport {
  generatedAt: string
  totals: {
    gpos: number; compliantGpos: number; gpoCompliancePct: number
    editGrants: number; validEditGrants: number; editGrantValidityPct: number
    findingsBySeverity: Record<Severity, number>
    findingsByCheck: Partial<Record<CheckKey, number>>
    identities: number; identitiesWithOpenViolations: number; policyCompliancePct: number
    /** Measured policy failures the detection jobs have not recorded. */
    unrecordedPolicyFailures: number
  }
  findings: Finding[]
  gpos: GpoStatusRow[]
  trustees: TrusteeRow[]
  policies: PolicyComplianceRow[]
}

export function buildGpoValidationReport(input: ValidationInput): GpoValidationReport {
  const findings = evaluateGpoFindings(input)
  const gpos = gpoStatusRows(input, findings)
  const trustees = trusteeRows(input, findings)
  const policiesRows = evaluatePolicyCompliance(input)
  const enabledPolicies = new Set(input.policies.filter((p) => p.enabled).map((p) => p.id))
  const violating = new Set(input.violations.filter((v) => v.status === 'open' && enabledPolicies.has(v.policyId)).map((v) => v.identityId))
  const now = input.now ?? new Date()
  for (const p of input.policies.filter((x) => x.enabled)) {
    const scope = policyScope(p)
    const population = input.identities.filter((i) =>
      scope === 'all' ? true : scope === 'tier_0' ? i.adTier === 'tier_0' : i.type === scope)
    const excepted = new Set(input.violations.filter((v) => v.policyId === p.id && v.status === 'excepted').map((v) => v.identityId))
    for (const id of measurePolicy(p, population, now) ?? []) if (!excepted.has(id)) violating.add(id)
  }
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  const byCheck: Partial<Record<CheckKey, number>> = {}
  for (const f of findings) {
    bySeverity[f.severity]++
    byCheck[f.check] = (byCheck[f.check] ?? 0) + 1
  }
  const pct = (a: number, b: number) => (b === 0 ? 100 : Math.round((a / b) * 1000) / 10)
  const compliantGpos = gpos.filter((g) => g.compliant).length
  const validGrants = trustees.filter((t) => t.valid).length
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    totals: {
      gpos: gpos.length, compliantGpos, gpoCompliancePct: pct(compliantGpos, gpos.length),
      editGrants: trustees.length, validEditGrants: validGrants, editGrantValidityPct: pct(validGrants, trustees.length),
      findingsBySeverity: bySeverity, findingsByCheck: byCheck,
      identities: input.identities.length, identitiesWithOpenViolations: violating.size,
      unrecordedPolicyFailures: policiesRows.reduce((n, p) => n + p.unrecorded, 0),
      policyCompliancePct: pct(input.identities.length - violating.size, input.identities.length),
    },
    findings, gpos, trustees, policies: policiesRows,
  }
}

// ── Database loader ──

export async function loadGpoValidationInput(orgId: string): Promise<ValidationInput> {
  const [gpoRows, permRows, identRows, groupRows, linkRows, baselineRows, policyRows, violationRows, mfaRows] = await Promise.all([
    db.select({
      id: gpoObjects.id, name: gpoObjects.name, adTier: gpoObjects.adTier, status: gpoObjects.status,
      ownerIdentityId: gpoObjects.ownerIdentityId, settings: gpoObjects.settings,
    }).from(gpoObjects).where(eq(gpoObjects.orgId, orgId)),
    db.select({
      gpoId: gpoPermissions.gpoId, trusteeIdentityId: gpoPermissions.trusteeIdentityId,
      trusteeGroupId: gpoPermissions.trusteeGroupId, trusteeName: gpoPermissions.trusteeName,
      permissionType: gpoPermissions.permissionType,
    }).from(gpoPermissions).where(eq(gpoPermissions.orgId, orgId)),
    db.select({
      id: identities.id, displayName: identities.displayName, type: identities.type, status: identities.status,
      adTier: identities.adTier, lastLogonAt: identities.lastLogonAt, ownerIdentityId: identities.ownerIdentityId,
      passwordLastSetAt: identities.passwordLastSetAt, tierViolation: identities.tierViolation,
    }).from(identities).where(eq(identities.orgId, orgId)),
    db.select({ id: groups.id, name: groups.name, adTier: groups.adTier }).from(groups).where(eq(groups.orgId, orgId)),
    db.select({
      gpoId: gpoLinks.gpoId, linkedOu: gpoLinks.linkedOu, linkOrder: gpoLinks.linkOrder,
      enforced: gpoLinks.enforced, linkEnabled: gpoLinks.linkEnabled, adTierOfOu: gpoLinks.adTierOfOu,
    }).from(gpoLinks).where(eq(gpoLinks.orgId, orgId)),
    db.select({ name: gpoBaselines.name, scope: gpoBaselines.scope, adTier: gpoBaselines.adTier, settings: gpoBaselines.settings })
      .from(gpoBaselines).where(eq(gpoBaselines.orgId, orgId)),
    db.select({
      id: policies.id, name: policies.name, type: policies.type, severity: policies.severity, enabled: policies.enabled,
      definition: policies.definition, frameworkMappings: policies.frameworkMappings,
    }).from(policies).where(eq(policies.orgId, orgId)),
    db.select({ policyId: policyViolations.policyId, identityId: policyViolations.identityId, status: policyViolations.status })
      .from(policyViolations).where(eq(policyViolations.orgId, orgId)),
    db.select({ identityId: accounts.identityId }).from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.mfaEnabled, true))),
  ])

  const groupIds = groupRows.map((g) => g.id)
  const memberRows = groupIds.length
    ? await db.select({ groupId: groupMemberships.groupId }).from(groupMemberships).where(inArray(groupMemberships.groupId, groupIds))
    : []
  const memberCount = new Map<string, number>()
  for (const m of memberRows) memberCount.set(m.groupId, (memberCount.get(m.groupId) ?? 0) + 1)
  const mfa = new Set(mfaRows.map((r) => r.identityId))

  return {
    gpos: gpoRows.map((g) => ({ ...g, adTier: g.adTier as Tier, settings: (g.settings as Record<string, string> | null) ?? null })),
    permissions: permRows,
    identities: identRows.map((i) => ({ ...i, adTier: i.adTier as Tier, mfa: mfa.has(i.id) })),
    groups: groupRows.map((g) => ({ ...g, adTier: g.adTier as Tier, memberCount: memberCount.get(g.id) ?? 0 })),
    links: linkRows.map((l) => ({ ...l, adTierOfOu: l.adTierOfOu as Tier })),
    baselines: baselineRows.map((b) => ({ ...b, adTier: b.adTier as Tier, settings: b.settings as Record<string, string> })),
    policies: policyRows.map((p) => ({
      ...p, severity: p.severity as Severity,
      definition: (p.definition as Record<string, unknown>) ?? {},
      frameworkMappings: (p.frameworkMappings as Record<string, string[]>) ?? {},
    })),
    violations: violationRows,
  }
}

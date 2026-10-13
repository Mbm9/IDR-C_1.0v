// GPO audit — RSoP conflict detection, baseline drift, and dangerous-setting checks.
//
// Goes beyond simple GPO tracking: computes the Resultant Set of Policy per OU from the GPOs
// linked to it (respecting link order + enforced), flags conflicting settings, and compares the
// effective configuration against approved security baselines (lib/db/schema/gpo-baselines.ts).
//
// Pure functions — the unified exposure scanner supplies the data and persists exposure_findings
// (category 'gpo').

import type { ExposureSeverity, RawFinding } from './exposure-types'
import { isControlPlaneTier } from '@/lib/utils/tiers'

export interface GpoInput {
  id: string
  name: string
  adTier: string
  settings: Record<string, string> | null
}

export interface GpoLinkInput {
  gpoId: string
  linkedOu: string
  linkOrder: number
  enforced: boolean
  linkEnabled: boolean
  adTierOfOu: string
}

export interface GpoBaselineInput {
  name: string
  scope: string
  adTier: string
  settings: Record<string, string>
}

// Settings that are security-sensitive — drift on these is escalated in severity.
const SENSITIVE_SETTINGS = new Set([
  'MinimumPasswordLength', 'PasswordComplexity', 'LmCompatibilityLevel',
  'RestrictAnonymous', 'EnableGuestAccount', 'LSAProtection',
  'SMBSigningRequired', 'AuditLogonEvents', 'RestrictNTLMInDomain',
])

// Known-dangerous setting values, independent of any baseline.
const DANGEROUS_VALUES: Record<string, { bad: string[]; title: string; severity: ExposureSeverity }> = {
  EnableGuestAccount: { bad: ['Enabled', '1', 'true'], title: 'Guest account enabled', severity: 'high' },
  LmCompatibilityLevel: { bad: ['0', '1', '2'], title: 'Weak LM/NTLM authentication level', severity: 'high' },
  PasswordComplexity: { bad: ['Disabled', '0', 'false'], title: 'Password complexity disabled', severity: 'high' },
  SMBSigningRequired: { bad: ['Disabled', '0', 'false'], title: 'SMB signing not required (NTLM relay risk)', severity: 'high' },
  RestrictAnonymous: { bad: ['0'], title: 'Anonymous enumeration permitted', severity: 'medium' },
  LSAProtection: { bad: ['Disabled', '0', 'false'], title: 'LSA protection (RunAsPPL) disabled', severity: 'medium' },
}

function gpoFinding(
  findingType: string,
  subjectName: string,
  severity: ExposureSeverity,
  title: string,
  evidence: Record<string, unknown>,
): RawFinding {
  return { category: 'gpo', findingType, subjectName, severity, impact: 'privilege_escalation', title, evidence }
}

// ── 1. Dangerous settings on individual GPOs ──

export function checkDangerousSettings(gpos: GpoInput[]): RawFinding[] {
  const out: RawFinding[] = []
  for (const gpo of gpos) {
    if (!gpo.settings) continue
    for (const [key, value] of Object.entries(gpo.settings)) {
      const rule = DANGEROUS_VALUES[key]
      if (rule && rule.bad.map((v) => v.toLowerCase()).includes(String(value).toLowerCase())) {
        const sev: ExposureSeverity = isControlPlaneTier(gpo.adTier) ? 'critical' : rule.severity
        out.push(gpoFinding('gpo_dangerous_setting', gpo.name, sev,
          `GPO "${gpo.name}": ${rule.title} (${key}=${value}).`,
          { setting: key, value, adTier: gpo.adTier }))
      }
    }
  }
  return out
}

// ── 2. RSoP conflicts — same setting set to different values by GPOs applied to one OU ──

export function checkRsopConflicts(gpos: GpoInput[], links: GpoLinkInput[]): RawFinding[] {
  const byId = new Map(gpos.map((g) => [g.id, g]))
  const byOu = new Map<string, GpoLinkInput[]>()
  for (const l of links) {
    if (!l.linkEnabled) continue
    if (!byOu.has(l.linkedOu)) byOu.set(l.linkedOu, [])
    byOu.get(l.linkedOu)!.push(l)
  }

  const out: RawFinding[] = []
  for (const [ou, ouLinks] of byOu) {
    // Per-setting: collect (gpoName, value, order, enforced)
    const settingMap = new Map<string, { gpo: string; value: string; order: number; enforced: boolean }[]>()
    for (const link of ouLinks) {
      const gpo = byId.get(link.gpoId)
      if (!gpo?.settings) continue
      for (const [key, value] of Object.entries(gpo.settings)) {
        if (!settingMap.has(key)) settingMap.set(key, [])
        settingMap.get(key)!.push({ gpo: gpo.name, value: String(value), order: link.linkOrder, enforced: link.enforced })
      }
    }

    for (const [key, entries] of settingMap) {
      const distinct = new Set(entries.map((e) => e.value))
      if (distinct.size > 1) {
        // Winner: an enforced link wins; otherwise lowest link order (closest to OU) wins.
        const sorted = [...entries].sort((a, b) =>
          (a.enforced === b.enforced ? a.order - b.order : a.enforced ? -1 : 1))
        const winner = sorted[0]
        const sev: ExposureSeverity = SENSITIVE_SETTINGS.has(key)
          ? (ouLinks.some((l) => isControlPlaneTier(l.adTierOfOu)) ? 'high' : 'medium')
          : 'low'
        out.push(gpoFinding('rsop_conflict', ou, sev,
          `RSoP conflict on OU "${ou}": setting "${key}" is set to ${distinct.size} different values across applied GPOs (effective: "${winner.value}" from "${winner.gpo}").`,
          { ou, setting: key, values: entries, effective: winner }))
      }
    }
  }
  return out
}

// ── 3. Baseline drift — effective OU policy vs approved baseline for that tier/scope ──

function effectiveSettingsForOu(ou: string, gpos: GpoInput[], links: GpoLinkInput[]): Record<string, string> {
  const byId = new Map(gpos.map((g) => [g.id, g]))
  const ouLinks = links
    .filter((l) => l.linkedOu === ou && l.linkEnabled)
    // lower order applied last (wins) unless enforced; sort so the winner is written last
    .sort((a, b) => (a.enforced === b.enforced ? b.linkOrder - a.linkOrder : a.enforced ? 1 : -1))
  const eff: Record<string, string> = {}
  for (const link of ouLinks) {
    const gpo = byId.get(link.gpoId)
    if (!gpo?.settings) continue
    for (const [k, v] of Object.entries(gpo.settings)) eff[k] = String(v)
  }
  return eff
}

export function checkBaselineDrift(
  gpos: GpoInput[],
  links: GpoLinkInput[],
  baselines: GpoBaselineInput[],
): RawFinding[] {
  const out: RawFinding[] = []
  const ous = [...new Set(links.filter((l) => l.linkEnabled).map((l) => l.linkedOu))]

  for (const ou of ous) {
    const ouTier = links.find((l) => l.linkedOu === ou)?.adTierOfOu ?? 'unclassified'
    const baseline = baselines.find((b) => b.adTier === ouTier) ?? baselines.find((b) => b.scope === 'Domain')
    if (!baseline) continue

    const eff = effectiveSettingsForOu(ou, gpos, links)
    const drifted: { setting: string; expected: string; actual: string }[] = []
    for (const [key, expected] of Object.entries(baseline.settings)) {
      const actual = eff[key]
      if (actual === undefined || actual.toLowerCase() !== String(expected).toLowerCase()) {
        drifted.push({ setting: key, expected: String(expected), actual: actual ?? '(not set)' })
      }
    }

    if (drifted.length > 0) {
      const hasSensitive = drifted.some((d) => SENSITIVE_SETTINGS.has(d.setting))
      const sev: ExposureSeverity = isControlPlaneTier(ouTier) && hasSensitive ? 'high'
        : hasSensitive ? 'medium' : 'low'
      out.push(gpoFinding('baseline_drift', ou, sev,
        `OU "${ou}" drifts from baseline "${baseline.name}": ${drifted.length} setting(s) differ.`,
        { ou, baseline: baseline.name, drifted }))
    }
  }
  return out
}

export function runGpoAudit(
  gpos: GpoInput[],
  links: GpoLinkInput[],
  baselines: GpoBaselineInput[],
): RawFinding[] {
  return [
    ...checkDangerousSettings(gpos),
    ...checkRsopConflicts(gpos, links),
    ...checkBaselineDrift(gpos, links, baselines),
  ]
}

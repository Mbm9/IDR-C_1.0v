// AD Certificate Services (AD CS) escalation checks — ESC1–ESC8.
//
// Evaluates the certificate-template + CA inventory (lib/db/schema/adcs.ts) for the well-known
// "Certified Pre-Owned" misconfigurations that let a low-privileged user obtain a certificate
// usable for domain authentication / privilege escalation.
//
// Pure functions over the ingested template/CA state — no DB access. The unified exposure
// scanner persists the results as exposure_findings (category 'certificate').

import type { ExposureImpact, ExposureSeverity, RawFinding } from './exposure-types'

// Subset of adcsTemplates row needed for evaluation.
export interface AdcsTemplateInput {
  name: string
  displayName?: string | null
  published: boolean
  enrolleeSuppliesSubject: boolean
  requiresManagerApproval: boolean
  authorizedSignaturesRequired: number
  ekus: string[]
  enrollmentLowPriv: boolean
  aclWritableByLowPriv: boolean
}

export interface AdcsAuthorityInput {
  name: string
  dnsName?: string | null
  editfAttributeSubjectAltName2: boolean
  webEnrollmentHttp: boolean
  enrollmentAgentRestrictionsEnabled: boolean
}

// EKUs that allow a certificate to be used for AD authentication (the dangerous ones for ESC1/2/3).
const AUTH_EKUS = ['client_auth', 'smartcard_logon', 'pkinit', 'any_purpose', 'no_eku']

function allowsDomainAuth(ekus: string[]): boolean {
  return ekus.some((e) => AUTH_EKUS.includes(e))
}

// A template is "openly enrollable" when low-priv principals can enroll without gating controls.
function openlyEnrollable(t: AdcsTemplateInput): boolean {
  return t.published && t.enrollmentLowPriv && !t.requiresManagerApproval && t.authorizedSignaturesRequired === 0
}

function finding(
  findingType: string,
  subjectName: string,
  severity: ExposureSeverity,
  impact: ExposureImpact,
  title: string,
  evidence: Record<string, unknown>,
): RawFinding {
  return { category: 'certificate', findingType, subjectName, severity, impact, title, evidence }
}

// ── Template checks ──

export function checkTemplate(t: AdcsTemplateInput): RawFinding[] {
  const out: RawFinding[] = []

  // ESC1 — enrollee supplies subject (SAN) + auth EKU + openly enrollable.
  if (openlyEnrollable(t) && t.enrolleeSuppliesSubject && allowsDomainAuth(t.ekus)) {
    out.push(finding('esc1', t.displayName || t.name, 'critical', 'privilege_escalation',
      `ESC1: template "${t.displayName || t.name}" lets low-privileged users supply an arbitrary SAN and obtain an authentication certificate — impersonate any user, including Domain Admins.`,
      { enrolleeSuppliesSubject: true, ekus: t.ekus, mitre: 'T1649' }))
  }

  // ESC2 — Any Purpose (or no) EKU + openly enrollable (cert usable for anything).
  if (openlyEnrollable(t) && (t.ekus.includes('any_purpose') || t.ekus.includes('no_eku'))) {
    out.push(finding('esc2', t.displayName || t.name, 'high', 'privilege_escalation',
      `ESC2: template "${t.displayName || t.name}" issues Any-Purpose/No-EKU certificates to low-privileged users.`,
      { ekus: t.ekus, mitre: 'T1649' }))
  }

  // ESC3 — Enrollment Agent template openly enrollable (request on behalf of others).
  if (openlyEnrollable(t) && t.ekus.includes('enrollment_agent')) {
    out.push(finding('esc3', t.displayName || t.name, 'high', 'privilege_escalation',
      `ESC3: template "${t.displayName || t.name}" grants the Certificate Request Agent EKU to low-privileged users — enroll on behalf of any principal.`,
      { ekus: t.ekus, mitre: 'T1649' }))
  }

  // ESC4 — template object writable by low-privileged principals (can be reconfigured into ESC1).
  if (t.published && t.aclWritableByLowPriv) {
    out.push(finding('esc4', t.displayName || t.name, 'high', 'privilege_escalation',
      `ESC4: certificate template "${t.displayName || t.name}" has a writable ACL for low-privileged principals — it can be rewritten into an ESC1 escalation.`,
      { aclWritableByLowPriv: true, mitre: 'T1649' }))
  }

  return out
}

// ── CA-level checks ──

export function checkAuthority(ca: AdcsAuthorityInput): RawFinding[] {
  const out: RawFinding[] = []

  // ESC6 — EDITF_ATTRIBUTESUBJECTALTNAME2 lets a SAN be specified on ANY request.
  if (ca.editfAttributeSubjectAltName2) {
    out.push(finding('esc6', ca.name, 'critical', 'privilege_escalation',
      `ESC6: CA "${ca.name}" has EDITF_ATTRIBUTESUBJECTALTNAME2 enabled — any enrollable certificate can carry an arbitrary SAN for authentication.`,
      { dnsName: ca.dnsName, mitre: 'T1649' }))
  }

  // ESC8 — HTTP web enrollment enabled → NTLM relay to AD CS.
  if (ca.webEnrollmentHttp) {
    out.push(finding('esc8', ca.name, 'high', 'credential_theft',
      `ESC8: CA "${ca.name}" exposes HTTP-based web enrollment, enabling NTLM relay to obtain authentication certificates.`,
      { dnsName: ca.dnsName, mitre: 'T1557' }))
  }

  // ESC7-adjacent — enrollment agent restrictions disabled compounds ESC3.
  if (!ca.enrollmentAgentRestrictionsEnabled) {
    out.push(finding('esc_agent_restrictions', ca.name, 'medium', 'privilege_escalation',
      `CA "${ca.name}" has no enrollment-agent restrictions — enrollment agents can request certificates for any template/principal.`,
      { dnsName: ca.dnsName, mitre: 'T1649' }))
  }

  return out
}

/** Evaluate every CA + template; returns all ESC findings. */
export function runAdcsChecks(
  authorities: AdcsAuthorityInput[],
  templates: AdcsTemplateInput[],
): RawFinding[] {
  const out: RawFinding[] = []
  for (const ca of authorities) out.push(...checkAuthority(ca))
  for (const t of templates) out.push(...checkTemplate(t))
  return out
}

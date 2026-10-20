// Shared types for the AD exposure-assessment check modules (ADCS, GPO, secrets).
// These map directly onto the exposure_findings table (lib/db/schema/exposure-findings.ts).

export type ExposureCategory = 'identity' | 'certificate' | 'gpo' | 'secret'
export type ExposureImpact = 'credential_theft' | 'privilege_escalation' | 'lateral_movement' | 'persistence'
export type ExposureSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface RawFinding {
  category: ExposureCategory
  findingType: string
  subjectName: string
  subjectRef?: string
  severity: ExposureSeverity
  impact: ExposureImpact
  title: string
  evidence: Record<string, unknown>
}

export const AD_TIER_CONFIG = {
  tier_0: { label: 'Tier 0', color: '#dc2626', bgColor: '#fef2f2', description: 'Identity Plane Control' },
  tier_top: { label: 'Top Tier', color: '#be123c', bgColor: '#fff1f2', description: 'Tier 0 Adjacent Control' },
  tier_1: { label: 'Tier 1', color: '#ea580c', bgColor: '#fff7ed', description: 'Server & Application Control' },
  tier_2: { label: 'Tier 2', color: '#2563eb', bgColor: '#eff6ff', description: 'Workstation & End-User' },
  unclassified: { label: 'Unclassified', color: '#6b7280', bgColor: '#f9fafb', description: 'Not Yet Classified' },
} as const

export const RISK_SCORE_THRESHOLDS = {
  low: { min: 0, max: 29, label: 'Low', color: '#16a34a', bgColor: '#f0fdf4' },
  medium: { min: 30, max: 59, label: 'Medium', color: '#ca8a04', bgColor: '#fefce8' },
  high: { min: 60, max: 79, label: 'High', color: '#ea580c', bgColor: '#fff7ed' },
  critical: { min: 80, max: 100, label: 'Critical', color: '#dc2626', bgColor: '#fef2f2' },
} as const

export const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: '#dc2626', bgColor: '#fef2f2' },
  high: { label: 'High', color: '#ea580c', bgColor: '#fff7ed' },
  medium: { label: 'Medium', color: '#ca8a04', bgColor: '#fefce8' },
  low: { label: 'Low', color: '#16a34a', bgColor: '#f0fdf4' },
} as const

export const IDENTITY_STATUS_CONFIG = {
  active: { label: 'Active', color: '#16a34a' },
  inactive: { label: 'Inactive', color: '#6b7280' },
  disabled: { label: 'Disabled', color: '#dc2626' },
  dormant: { label: 'Dormant', color: '#ca8a04' },
  orphaned: { label: 'Orphaned', color: '#9333ea' },
  suspended: { label: 'Suspended', color: '#ea580c' },
} as const

export const SYNC_STATUS_CONFIG = {
  connected: { label: 'Connected', color: '#16a34a' },
  syncing: { label: 'Syncing', color: '#2563eb' },
  error: { label: 'Error', color: '#dc2626' },
  disconnected: { label: 'Disconnected', color: '#6b7280' },
} as const

export const IDENTITY_TYPE_CONFIG = {
  human: { label: 'Human', color: '#2563eb', bgColor: '#eff6ff' },
  non_human: { label: 'Non-Human', color: '#7c3aed', bgColor: '#f5f3ff' },
} as const

export const VIOLATION_TYPE_LABELS: Record<string, string> = {
  tier_breach: 'Tier Breach',
  sod_conflict: 'SoD Conflict',
  excessive_privilege: 'Excessive Privilege',
  dormant_access: 'Dormant Access',
  orphaned_identity: 'Orphaned Identity',
  missing_mfa: 'Missing MFA',
  expired_certification: 'Expired Certification',
  password_age: 'Password Age',
} as const

export const RISK_THRESHOLDS = {
  low: 29,
  medium: 59,
  high: 79,
  critical: 100,
} as const

export function getRiskLevel(score: number) {
  if (score >= 80) return RISK_SCORE_THRESHOLDS.critical
  if (score >= 60) return RISK_SCORE_THRESHOLDS.high
  if (score >= 30) return RISK_SCORE_THRESHOLDS.medium
  return RISK_SCORE_THRESHOLDS.low
}

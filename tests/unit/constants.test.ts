import { describe, it, expect } from 'vitest'
import {
  AD_TIER_CONFIG,
  RISK_SCORE_THRESHOLDS,
  SEVERITY_CONFIG,
  IDENTITY_STATUS_CONFIG,
  SYNC_STATUS_CONFIG,
  IDENTITY_TYPE_CONFIG,
  VIOLATION_TYPE_LABELS,
  RISK_THRESHOLDS,
  getRiskLevel,
} from '@/lib/utils/constants'

describe('getRiskLevel', () => {
  it('returns "Low" for score 0', () => {
    const result = getRiskLevel(0)
    expect(result.label).toBe('Low')
  })

  it('returns "Low" for score 29', () => {
    const result = getRiskLevel(29)
    expect(result.label).toBe('Low')
  })

  it('returns "Medium" for score 30', () => {
    const result = getRiskLevel(30)
    expect(result.label).toBe('Medium')
  })

  it('returns "Medium" for score 59', () => {
    const result = getRiskLevel(59)
    expect(result.label).toBe('Medium')
  })

  it('returns "High" for score 60', () => {
    const result = getRiskLevel(60)
    expect(result.label).toBe('High')
  })

  it('returns "High" for score 79', () => {
    const result = getRiskLevel(79)
    expect(result.label).toBe('High')
  })

  it('returns "Critical" for score 80', () => {
    const result = getRiskLevel(80)
    expect(result.label).toBe('Critical')
  })

  it('returns "Critical" for score 100', () => {
    const result = getRiskLevel(100)
    expect(result.label).toBe('Critical')
  })

  it('returns object with color and bgColor', () => {
    const result = getRiskLevel(50)
    expect(result).toHaveProperty('color')
    expect(result).toHaveProperty('bgColor')
    expect(result).toHaveProperty('label')
    expect(result).toHaveProperty('min')
    expect(result).toHaveProperty('max')
  })
})

describe('AD_TIER_CONFIG', () => {
  it('has all five tiers', () => {
    expect(AD_TIER_CONFIG).toHaveProperty('tier_0')
    expect(AD_TIER_CONFIG).toHaveProperty('tier_top')
    expect(AD_TIER_CONFIG).toHaveProperty('tier_1')
    expect(AD_TIER_CONFIG).toHaveProperty('tier_2')
    expect(AD_TIER_CONFIG).toHaveProperty('unclassified')
  })

  it('each tier has label, color, bgColor, and description', () => {
    for (const tier of Object.values(AD_TIER_CONFIG)) {
      expect(tier).toHaveProperty('label')
      expect(tier).toHaveProperty('color')
      expect(tier).toHaveProperty('bgColor')
      expect(tier).toHaveProperty('description')
      expect(typeof tier.label).toBe('string')
      expect(typeof tier.color).toBe('string')
      expect(tier.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('RISK_SCORE_THRESHOLDS', () => {
  it('has all four levels', () => {
    expect(RISK_SCORE_THRESHOLDS).toHaveProperty('low')
    expect(RISK_SCORE_THRESHOLDS).toHaveProperty('medium')
    expect(RISK_SCORE_THRESHOLDS).toHaveProperty('high')
    expect(RISK_SCORE_THRESHOLDS).toHaveProperty('critical')
  })

  it('each level has min, max, label, color, bgColor', () => {
    for (const level of Object.values(RISK_SCORE_THRESHOLDS)) {
      expect(level).toHaveProperty('min')
      expect(level).toHaveProperty('max')
      expect(level).toHaveProperty('label')
      expect(level).toHaveProperty('color')
      expect(level).toHaveProperty('bgColor')
      expect(typeof level.min).toBe('number')
      expect(typeof level.max).toBe('number')
    }
  })

  it('ranges do not overlap and cover 0-100', () => {
    expect(RISK_SCORE_THRESHOLDS.low.min).toBe(0)
    expect(RISK_SCORE_THRESHOLDS.low.max).toBeLessThan(RISK_SCORE_THRESHOLDS.medium.min)
    expect(RISK_SCORE_THRESHOLDS.medium.max).toBeLessThan(RISK_SCORE_THRESHOLDS.high.min)
    expect(RISK_SCORE_THRESHOLDS.high.max).toBeLessThan(RISK_SCORE_THRESHOLDS.critical.min)
    expect(RISK_SCORE_THRESHOLDS.critical.max).toBe(100)
  })
})

describe('SEVERITY_CONFIG', () => {
  it('has all four severities', () => {
    expect(SEVERITY_CONFIG).toHaveProperty('critical')
    expect(SEVERITY_CONFIG).toHaveProperty('high')
    expect(SEVERITY_CONFIG).toHaveProperty('medium')
    expect(SEVERITY_CONFIG).toHaveProperty('low')
  })

  it('each severity has label, color, bgColor', () => {
    for (const sev of Object.values(SEVERITY_CONFIG)) {
      expect(sev).toHaveProperty('label')
      expect(sev).toHaveProperty('color')
      expect(sev).toHaveProperty('bgColor')
    }
  })
})

describe('IDENTITY_STATUS_CONFIG', () => {
  it('has all required statuses', () => {
    const expected = ['active', 'inactive', 'disabled', 'dormant', 'orphaned', 'suspended']
    for (const status of expected) {
      expect(IDENTITY_STATUS_CONFIG).toHaveProperty(status)
    }
  })

  it('each status has label and color', () => {
    for (const status of Object.values(IDENTITY_STATUS_CONFIG)) {
      expect(status).toHaveProperty('label')
      expect(status).toHaveProperty('color')
      expect(typeof status.label).toBe('string')
      expect(status.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('SYNC_STATUS_CONFIG', () => {
  it('has all required statuses', () => {
    expect(SYNC_STATUS_CONFIG).toHaveProperty('connected')
    expect(SYNC_STATUS_CONFIG).toHaveProperty('syncing')
    expect(SYNC_STATUS_CONFIG).toHaveProperty('error')
    expect(SYNC_STATUS_CONFIG).toHaveProperty('disconnected')
  })
})

describe('IDENTITY_TYPE_CONFIG', () => {
  it('has human and non_human types', () => {
    expect(IDENTITY_TYPE_CONFIG).toHaveProperty('human')
    expect(IDENTITY_TYPE_CONFIG).toHaveProperty('non_human')
  })

  it('each type has label, color, bgColor', () => {
    for (const t of Object.values(IDENTITY_TYPE_CONFIG)) {
      expect(t).toHaveProperty('label')
      expect(t).toHaveProperty('color')
      expect(t).toHaveProperty('bgColor')
    }
  })
})

describe('VIOLATION_TYPE_LABELS', () => {
  it('has all violation types', () => {
    const expected = [
      'tier_breach',
      'sod_conflict',
      'excessive_privilege',
      'dormant_access',
      'orphaned_identity',
      'missing_mfa',
      'expired_certification',
      'password_age',
    ]
    for (const type of expected) {
      expect(VIOLATION_TYPE_LABELS).toHaveProperty(type)
      expect(typeof VIOLATION_TYPE_LABELS[type]).toBe('string')
    }
  })
})

describe('RISK_THRESHOLDS', () => {
  it('has all threshold levels', () => {
    expect(RISK_THRESHOLDS).toHaveProperty('low')
    expect(RISK_THRESHOLDS).toHaveProperty('medium')
    expect(RISK_THRESHOLDS).toHaveProperty('high')
    expect(RISK_THRESHOLDS).toHaveProperty('critical')
  })

  it('values are in ascending order', () => {
    expect(RISK_THRESHOLDS.low).toBeLessThan(RISK_THRESHOLDS.medium)
    expect(RISK_THRESHOLDS.medium).toBeLessThan(RISK_THRESHOLDS.high)
    expect(RISK_THRESHOLDS.high).toBeLessThan(RISK_THRESHOLDS.critical)
  })

  it('critical threshold is 100', () => {
    expect(RISK_THRESHOLDS.critical).toBe(100)
  })
})

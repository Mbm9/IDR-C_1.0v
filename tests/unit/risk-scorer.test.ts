import { describe, it, expect, vi } from 'vitest'

// Mock the db module before importing scorer
vi.mock('@/lib/db', () => ({
  db: {},
}))
vi.mock('@/lib/db/schema', () => ({
  identities: {},
  accounts: {},
  entitlements: {},
  policyViolations: {},
  attackPaths: {},
  shadowAdmins: {},
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  count: vi.fn(),
  sql: vi.fn(),
  lt: vi.fn(),
}))

import { calculateRiskScore, privilegeLevelForTier } from '@/lib/risk/scorer'

// Helper to create a default zero-risk factors object
function zeroFactors() {
  return {
    tierViolation: false as boolean,
    privilegeLevel: 0,
    dormancyDays: 0 as number | null,
    violationCount: 0,
    missingMfa: false as boolean,
    certificationOverdue: false as boolean,
    orphanedNhi: false as boolean,
    attackPathCount: 0,
    isShadowAdmin: false as boolean,
    peerAnomalyScore: 0,
    supplyChainRisk: false as boolean,
  }
}

describe('calculateRiskScore', () => {
  it('returns 0 for an identity with no risk factors', () => {
    const score = calculateRiskScore(zeroFactors())
    expect(score).toBe(0)
  })

  it('adds 22 points for a tier violation', () => {
    const withViolation = calculateRiskScore({ ...zeroFactors(), tierViolation: true })
    const without = calculateRiskScore(zeroFactors())
    expect(withViolation - without).toBe(22)
  })

  it('adds 15 points for full privilege level (1.0)', () => {
    const score = calculateRiskScore({ ...zeroFactors(), privilegeLevel: 1 })
    expect(score).toBe(15)
  })

  it('adds ~8 points for half privilege level (0.5)', () => {
    const score = calculateRiskScore({ ...zeroFactors(), privilegeLevel: 0.5 })
    expect(score).toBe(8) // 0.5 * 15 = 7.5 → rounded 8
  })

  it('scales dormancy up to 10 points for 180+ days', () => {
    const score180 = calculateRiskScore({ ...zeroFactors(), dormancyDays: 180 })
    expect(score180).toBe(10)

    const score360 = calculateRiskScore({ ...zeroFactors(), dormancyDays: 360 })
    expect(score360).toBe(10)
  })

  it('scales dormancy proportionally for partial dormancy', () => {
    const score90 = calculateRiskScore({ ...zeroFactors(), dormancyDays: 90 })
    // 90/180 * 10 = 5
    expect(score90).toBe(5)
  })

  it('scales violation count up to 10 points for 5+ violations', () => {
    const score5 = calculateRiskScore({ ...zeroFactors(), violationCount: 5 })
    expect(score5).toBe(10)

    const score10 = calculateRiskScore({ ...zeroFactors(), violationCount: 10 })
    expect(score10).toBe(10)
  })

  it('adds 8 points for missing MFA', () => {
    const score = calculateRiskScore({ ...zeroFactors(), missingMfa: true })
    expect(score).toBe(8)
  })

  it('adds 3 points for certification overdue', () => {
    const score = calculateRiskScore({ ...zeroFactors(), certificationOverdue: true })
    expect(score).toBe(3)
  })

  it('adds 2 points for orphaned NHI', () => {
    const score = calculateRiskScore({ ...zeroFactors(), orphanedNhi: true })
    expect(score).toBe(2)
  })

  it('adds 12 points for shadow admin', () => {
    const score = calculateRiskScore({ ...zeroFactors(), isShadowAdmin: true })
    expect(score).toBe(12)
  })

  it('adds up to 10 points for attack paths', () => {
    const score3 = calculateRiskScore({ ...zeroFactors(), attackPathCount: 3 })
    expect(score3).toBe(10)

    const score1 = calculateRiskScore({ ...zeroFactors(), attackPathCount: 1 })
    // 1/3 * 10 ≈ 3.33 → 3
    expect(score1).toBe(3)
  })

  it('adds 4 points for peer anomaly score at max', () => {
    const score = calculateRiskScore({ ...zeroFactors(), peerAnomalyScore: 5 })
    expect(score).toBe(4)
  })

  it('adds 4 points for supply chain risk', () => {
    const score = calculateRiskScore({ ...zeroFactors(), supplyChainRisk: true })
    expect(score).toBe(4)
  })

  it('computes 100 score with all risk factors maxed', () => {
    const score = calculateRiskScore({
      tierViolation: true,         // 22
      privilegeLevel: 1,           // 15
      dormancyDays: 365,           // 10
      violationCount: 10,          // 10
      missingMfa: true,            // 8
      certificationOverdue: true,  // 3
      orphanedNhi: true,           // 2
      attackPathCount: 5,          // 10
      isShadowAdmin: true,         // 12
      peerAnomalyScore: 10,        // 4
      supplyChainRisk: true,       // 4
    })
    // 22+15+10+10+8+3+2+10+12+4+4 = 100
    expect(score).toBe(100)
  })

  it('caps the score at 100 even if factors exceed', () => {
    const score = calculateRiskScore({
      tierViolation: true,
      privilegeLevel: 1,
      dormancyDays: 999,
      violationCount: 999,
      missingMfa: true,
      certificationOverdue: true,
      orphanedNhi: true,
      attackPathCount: 999,
      isShadowAdmin: true,
      peerAnomalyScore: 999,
      supplyChainRisk: true,
    })
    expect(score).toBeLessThanOrEqual(100)
  })

  it('handles null dormancyDays gracefully (treated as 0)', () => {
    const score = calculateRiskScore({ ...zeroFactors(), dormancyDays: null })
    expect(score).toBe(0)
  })

  it('returns an integer (rounded)', () => {
    const score = calculateRiskScore({
      ...zeroFactors(),
      privilegeLevel: 0.33,
      dormancyDays: 45,
      violationCount: 1,
    })
    expect(Number.isInteger(score)).toBe(true)
  })

  it('computes a medium-risk identity correctly', () => {
    const score = calculateRiskScore({
      ...zeroFactors(),
      privilegeLevel: 0.5,  // 7.5
      dormancyDays: 30,     // 30/180*10 ≈ 1.67
      violationCount: 2,    // 2/5*10 = 4
      missingMfa: true,     // 8
    })
    // ~7.5 + 1.67 + 4 + 8 = 21.17 → 21
    expect(score).toBeGreaterThanOrEqual(18)
    expect(score).toBeLessThanOrEqual(25)
  })
})

describe('privilegeLevelForTier', () => {
  it('ranks Top Tier between Tier 0 and Tier 1', () => {
    expect(privilegeLevelForTier('tier_0')).toBe(1)
    expect(privilegeLevelForTier('tier_top')).toBe(0.75)
    expect(privilegeLevelForTier('tier_1')).toBe(0.5)
    expect(privilegeLevelForTier('tier_2')).toBe(0)
    expect(privilegeLevelForTier('unclassified')).toBe(0)
    expect(privilegeLevelForTier(null)).toBe(0)
  })
})

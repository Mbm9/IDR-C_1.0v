import { describe, it, expect } from 'vitest'
import {
  AD_TIERS, CLASSIFIED_TIERS, TIER_RANK, TIER_SHORT,
  tierRank, isStricterTier, stricterTier, isControlPlaneTier,
} from '@/lib/utils/tiers'

describe('tier helpers', () => {
  it('orders tiers most privileged first, with Top Tier between Tier 0 and Tier 1', () => {
    expect(AD_TIERS).toEqual(['tier_0', 'tier_top', 'tier_1', 'tier_2', 'unclassified'])
    expect(CLASSIFIED_TIERS).toEqual(['tier_0', 'tier_top', 'tier_1', 'tier_2'])
    expect([...AD_TIERS].sort((a, b) => TIER_RANK[a] - TIER_RANK[b])).toEqual([...AD_TIERS])
  })

  it('does not rely on string order (tier_top sorts after tier_2 lexically)', () => {
    expect('tier_top' > 'tier_2').toBe(true)
    expect(tierRank('tier_top')).toBeLessThan(tierRank('tier_1'))
  })

  it('ranks null, undefined and unknown values as unclassified', () => {
    expect(tierRank(null)).toBe(TIER_RANK.unclassified)
    expect(tierRank(undefined)).toBe(TIER_RANK.unclassified)
    expect(tierRank('tier_9')).toBe(TIER_RANK.unclassified)
  })

  it('isStricterTier compares privilege', () => {
    expect(isStricterTier('tier_0', 'tier_top')).toBe(true)
    expect(isStricterTier('tier_top', 'tier_1')).toBe(true)
    expect(isStricterTier('tier_top', 'tier_0')).toBe(false)
    expect(isStricterTier('tier_top', 'tier_top')).toBe(false)
    expect(isStricterTier('tier_2', null)).toBe(true)
    expect(isStricterTier('unclassified', 'tier_2')).toBe(false)
  })

  it('stricterTier returns the more privileged tier', () => {
    expect(stricterTier('tier_1', 'tier_top')).toBe('tier_top')
    expect(stricterTier('tier_top', 'tier_0')).toBe('tier_0')
    expect(stricterTier('unclassified', 'tier_2')).toBe('tier_2')
    expect(stricterTier('tier_1', 'tier_1')).toBe('tier_1')
  })

  it('treats Tier 0 and Top Tier as control plane', () => {
    expect(AD_TIERS.filter(isControlPlaneTier)).toEqual(['tier_0', 'tier_top'])
    expect(isControlPlaneTier(null)).toBe(false)
  })

  it('has a short label for every tier', () => {
    expect(TIER_SHORT).toEqual({ tier_0: 'T0', tier_top: 'TOP', tier_1: 'T1', tier_2: 'T2', unclassified: '?' })
  })
})

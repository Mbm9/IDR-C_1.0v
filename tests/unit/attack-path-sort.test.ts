import { describe, it, expect } from 'vitest'
import { parseAttackPathSort, attackPathSortKeys } from '@/lib/schemas/attack-path'

describe('parseAttackPathSort', () => {
  it('defaults to risk when the param is absent or empty', () => {
    expect(parseAttackPathSort(null)).toBe('risk')
    expect(parseAttackPathSort(undefined)).toBe('risk')
    expect(parseAttackPathSort('')).toBe('risk')
  })

  it('accepts the known values', () => {
    expect(parseAttackPathSort('risk')).toBe('risk')
    expect(parseAttackPathSort('length')).toBe('length')
  })

  it('rejects unknown values', () => {
    expect(parseAttackPathSort('LENGTH')).toBeNull()
    expect(parseAttackPathSort('riskScore')).toBeNull()
    expect(parseAttackPathSort('length;drop')).toBeNull()
  })
})

describe('attackPathSortKeys', () => {
  it('risk orders by riskScore with an id tiebreaker', () => {
    expect(attackPathSortKeys('risk')).toEqual(['riskScore', 'id'])
  })

  it('length orders by pathLength, then riskScore, then id', () => {
    expect(attackPathSortKeys('length')).toEqual(['pathLength', 'riskScore', 'id'])
  })
})

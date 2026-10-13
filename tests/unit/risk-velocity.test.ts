import { describe, it, expect, vi, beforeEach } from 'vitest'

// recalculateRiskForIdentity reads the identity, runs five count queries and
// writes one update. The fake db answers selects in call order.
const selectResults: unknown[][] = []
const updates: Array<Record<string, any>> = []

vi.mock('@/lib/db', () => {
  const chain = (result: unknown[]) => {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: () => c,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return c
  }
  return {
    db: {
      select: () => chain(selectResults.shift() ?? []),
      update: () => ({
        set: (values: Record<string, any>) => {
          updates.push(values)
          return { where: () => Promise.resolve() }
        },
      }),
    },
  }
})
vi.mock('@/lib/db/schema', () => ({
  identities: {}, accounts: {}, entitlements: {}, policyViolations: {}, attackPaths: {}, shadowAdmins: {},
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), count: vi.fn(), sql: vi.fn() }))

import {
  appendScoreHistory,
  calculateRiskVelocity,
  readScoreHistory,
  recalculateRiskForIdentity,
  velocityFromHistory,
  SCORE_HISTORY_DAYS,
  type ScoreHistoryPoint,
} from '@/lib/risk/scorer'

const NOW = new Date('2026-10-13T08:00:00Z')

function daysBefore(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10)
}

describe('calculateRiskVelocity', () => {
  it('divides the change by the elapsed days', () => {
    expect(calculateRiskVelocity(60, 30, 30)).toBe(1)
    expect(calculateRiskVelocity(30, 60, 10)).toBe(-3)
  })
  it('returns 0 when no time has elapsed', () => {
    expect(calculateRiskVelocity(80, 20, 0)).toBe(0)
  })
})

describe('appendScoreHistory', () => {
  it('adds one point per day and the latest run of a day wins', () => {
    let h: ScoreHistoryPoint[] = []
    h = appendScoreHistory(h, 40, NOW)
    h = appendScoreHistory(h, 55, new Date('2026-10-13T20:00:00Z'))
    expect(h).toEqual([{ d: '2026-10-13', s: 55 }])
  })

  it('keeps points sorted and drops ones older than the retention window', () => {
    const h = appendScoreHistory(
      [
        { d: daysBefore(SCORE_HISTORY_DAYS + 5), s: 1 },
        { d: daysBefore(2), s: 30 },
        { d: daysBefore(20), s: 20 },
      ],
      50,
      NOW,
    )
    expect(h.map((p) => p.d)).toEqual([daysBefore(20), daysBefore(2), '2026-10-13'])
  })
})

describe('readScoreHistory', () => {
  it('tolerates legacy array / empty / malformed risk_factors', () => {
    expect(readScoreHistory([])).toEqual([])
    expect(readScoreHistory(null)).toEqual([])
    expect(readScoreHistory({ tierViolation: true })).toEqual([])
    expect(readScoreHistory({ history: [{ d: 'bad', s: 1 }, { d: '2026-10-01', s: 'x' }, { d: '2026-10-02', s: 7 }] }))
      .toEqual([{ d: '2026-10-02', s: 7 }])
  })
})

describe('velocityFromHistory', () => {
  it('is 0 with only today in the history', () => {
    expect(velocityFromHistory([{ d: '2026-10-13', s: 70 }], 70, NOW)).toBe(0)
  })

  it('compares with the point ~30 days ago when available', () => {
    const history = [
      { d: daysBefore(34), s: 10 },
      { d: daysBefore(30), s: 40 },
      { d: daysBefore(10), s: 90 },
      { d: '2026-10-13', s: 70 },
    ]
    // (70 - 40) / 30
    expect(velocityFromHistory(history, 70, NOW)).toBe(1)
  })

  it('falls back to the oldest point when history is shorter than 30 days', () => {
    const history = [
      { d: daysBefore(5), s: 20 },
      { d: daysBefore(1), s: 25 },
      { d: '2026-10-13', s: 30 },
    ]
    // (30 - 20) / 5
    expect(velocityFromHistory(history, 30, NOW)).toBe(2)
  })

  it('is negative when the identity is improving', () => {
    expect(velocityFromHistory([{ d: daysBefore(4), s: 80 }], 60, NOW)).toBe(-5)
  })
})

describe('recalculateRiskForIdentity', () => {
  beforeEach(() => {
    selectResults.length = 0
    updates.length = 0
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('persists history and riskVelocity in risk_factors, preserving earlier points', async () => {
    selectResults.push(
      [{
        id: 'i-1', orgId: 'o-1', type: 'human', adTier: 'tier_0', tierViolation: true,
        lastLogonAt: NOW, ownerIdentityId: null,
        riskFactors: { riskVelocity: 0, history: [{ d: daysBefore(10), s: 17 }] },
      }],
      [{ count: 0 }],        // open violations
      [{ hasMfa: true }],    // mfa
      [{ overdue: 0 }],      // expired certifications
      [{ count: 0 }],        // attack paths
      [{ count: 0 }],        // shadow admin
    )

    const result = await recalculateRiskForIdentity('i-1', 'o-1')
    vi.useRealTimers()

    // tier violation 22 + tier_0 privilege 15
    expect(result?.score).toBe(37)
    expect(updates).toHaveLength(1)
    const stored = updates[0].riskFactors
    expect(stored.history).toEqual([{ d: daysBefore(10), s: 17 }, { d: '2026-10-13', s: 37 }])
    expect(stored.riskVelocity).toBe(2) // (37 - 17) / 10
    expect(stored.tierViolation).toBe(true)
  })

  it('returns null for an identity outside the org', async () => {
    selectResults.push([])
    expect(await recalculateRiskForIdentity('missing', 'o-1')).toBeNull()
    vi.useRealTimers()
    expect(updates).toHaveLength(0)
  })
})

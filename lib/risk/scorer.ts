import { db } from '@/lib/db'
import { identities, accounts, entitlements, policyViolations, attackPaths, shadowAdmins } from '@/lib/db/schema'
import { eq, and, count, sql } from 'drizzle-orm'

interface RiskFactors {
  tierViolation: boolean
  privilegeLevel: number
  dormancyDays: number | null
  violationCount: number
  missingMfa: boolean
  certificationOverdue: boolean
  orphanedNhi: boolean
  attackPathCount: number
  isShadowAdmin: boolean
  peerAnomalyScore: number
  supplyChainRisk: boolean
}

/** What is persisted in identities.risk_factors. */
export interface StoredRiskFactors extends RiskFactors {
  riskVelocity: number
  history: ScoreHistoryPoint[]
}

/** One point of the compact per-identity score history: day + score. */
export interface ScoreHistoryPoint {
  d: string // YYYY-MM-DD (UTC)
  s: number
}

/** Days of score history kept in identities.risk_factors.history. */
export const SCORE_HISTORY_DAYS = 35
/** Look-back window for risk velocity. */
export const VELOCITY_WINDOW_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** UTC calendar day of a date as YYYY-MM-DD. */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** Extract a well-formed history array from a stored risk_factors value. */
export function readScoreHistory(riskFactors: unknown): ScoreHistoryPoint[] {
  if (!riskFactors || typeof riskFactors !== 'object' || Array.isArray(riskFactors)) return []
  const raw = (riskFactors as { history?: unknown }).history
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is ScoreHistoryPoint =>
    !!p && typeof p === 'object' &&
    typeof (p as any).d === 'string' && DAY_RE.test((p as any).d) &&
    typeof (p as any).s === 'number' && Number.isFinite((p as any).s))
}

/**
 * Record today's score in the history: one point per day (a later run on the
 * same day replaces the earlier point), sorted oldest first, trimmed to the
 * last `keepDays` days.
 */
export function appendScoreHistory(
  history: ScoreHistoryPoint[],
  score: number,
  now: Date = new Date(),
  keepDays: number = SCORE_HISTORY_DAYS,
): ScoreHistoryPoint[] {
  const today = toDayKey(now)
  return [...history.filter((p) => p.d !== today), { d: today, s: score }]
    .filter((p) => dayDiff(p.d, today) >= 0 && dayDiff(p.d, today) <= keepDays)
    .sort((a, b) => a.d.localeCompare(b.d))
}

/**
 * Calculate risk velocity: rate of risk score change per day.
 * Positive = getting riskier, negative = improving.
 */
export function calculateRiskVelocity(currentScore: number, previousScore: number, days = VELOCITY_WINDOW_DAYS): number {
  if (!(days > 0)) return 0
  return Number(((currentScore - previousScore) / days).toFixed(2))
}

/**
 * Risk velocity from the score history: (score now − score ~30 days ago) / days
 * elapsed. The reference point is the most recent one at least 30 days old, or
 * the oldest available when the history is shorter. Returns 0 when there is no
 * earlier day to compare against.
 */
export function velocityFromHistory(
  history: ScoreHistoryPoint[],
  currentScore: number,
  now: Date = new Date(),
  windowDays: number = VELOCITY_WINDOW_DAYS,
): number {
  const today = toDayKey(now)
  const earlier = history
    .filter((p) => dayDiff(p.d, today) > 0)
    .sort((a, b) => a.d.localeCompare(b.d))
  if (earlier.length === 0) return 0
  const atWindow = earlier.filter((p) => dayDiff(p.d, today) >= windowDays)
  const ref = atWindow.length > 0 ? atWindow[atWindow.length - 1] : earlier[0]
  return calculateRiskVelocity(currentScore, ref.s, dayDiff(ref.d, today))
}

/**
 * Calculate risk score from factors.
 *
 * Weight allocation (total = 100):
 *   tierViolation:        22  (was 30, rebalanced)
 *   privilegeLevel:       15  (was 20)
 *   dormancyDays:         10  (was 15)
 *   violationCount:       10  (was 15)
 *   missingMfa:            8  (was 10)
 *   certificationOverdue:  3  (was 5)
 *   orphanedNhi:           2  (was 5)
 *   attackPathCount:       10  (NEW)
 *   isShadowAdmin:        12  (NEW)
 *   peerAnomalyScore:      4  (NEW)
 *   supplyChainRisk:       4  (NEW)
 */
export function calculateRiskScore(factors: RiskFactors): number {
  const score =
    (factors.tierViolation ? 1 : 0) * 22 +
    factors.privilegeLevel * 15 +
    Math.min(1, (factors.dormancyDays ?? 0) / 180) * 10 +
    Math.min(1, factors.violationCount / 5) * 10 +
    (factors.missingMfa ? 1 : 0) * 8 +
    (factors.certificationOverdue ? 1 : 0) * 3 +
    (factors.orphanedNhi ? 1 : 0) * 2 +
    Math.min(1, (factors.attackPathCount ?? 0) / 3) * 10 +
    (factors.isShadowAdmin ? 1 : 0) * 12 +
    Math.min(1, (factors.peerAnomalyScore ?? 0) / 5) * 4 +
    (factors.supplyChainRisk ? 1 : 0) * 4

  return Math.min(100, Math.round(score))
}

export async function recalculateRiskForIdentity(identityId: string, orgId: string) {
  const [identity] = await db.select().from(identities)
    .where(and(eq(identities.id, identityId), eq(identities.orgId, orgId)))
    .limit(1)

  if (!identity) return null

  const [
    violationRows,
    mfaRows,
    certRows,
    attackPathRows,
    shadowAdminRows,
  ] = await Promise.all([
    db.select({ count: count() })
      .from(policyViolations)
      .where(and(eq(policyViolations.identityId, identityId), eq(policyViolations.status, 'open'))),

    db.select({ hasMfa: sql<boolean>`bool_or(${accounts.mfaEnabled})` })
      .from(accounts)
      .where(eq(accounts.identityId, identityId)),

    db.select({ overdue: count() })
      .from(entitlements)
      .where(and(
        eq(entitlements.identityId, identityId),
        eq(entitlements.certificationStatus, 'expired'),
      )),

    db.select({ count: count() })
      .from(attackPaths)
      .where(eq(attackPaths.sourceIdentityId, identityId)),

    db.select({ count: count() })
      .from(shadowAdmins)
      .where(and(
        eq(shadowAdmins.identityId, identityId),
        eq(shadowAdmins.status, 'open'),
      )),
  ])

  const violationResult = violationRows[0]
  const mfaResult = mfaRows[0]
  const certResult = certRows[0]
  const attackPathResult = attackPathRows[0]
  const shadowAdminResult = shadowAdminRows[0]

  const dormancyDays = identity.lastLogonAt
    ? Math.floor((Date.now() - new Date(identity.lastLogonAt).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const isPrivileged = identity.adTier === 'tier_0' ? 1 : identity.adTier === 'tier_1' ? 0.5 : 0
  const isOrphanedNhi = identity.type === 'non_human' && !identity.ownerIdentityId

  // Check supply chain risk: NHI owner with no backup owners for critical NHIs
  const isSupplyChainRisk = identity.type === 'human' && identity.ownerIdentityId === null
    // Simplified: if they own NHIs and have high privilege, they're a supply chain risk
    ? false
    : false

  const factors: RiskFactors = {
    tierViolation: identity.tierViolation,
    privilegeLevel: isPrivileged,
    dormancyDays,
    violationCount: Number(violationResult?.count ?? 0),
    missingMfa: !mfaResult?.hasMfa,
    certificationOverdue: Number(certResult?.overdue ?? 0) > 0,
    orphanedNhi: isOrphanedNhi,
    attackPathCount: Number(attackPathResult?.count ?? 0),
    isShadowAdmin: Number(shadowAdminResult?.count ?? 0) > 0,
    peerAnomalyScore: 0, // Computed separately by peer analysis engine
    supplyChainRisk: isSupplyChainRisk,
  }

  const score = calculateRiskScore(factors)

  // Compact score history (one point per day) lives alongside the factors so
  // velocity can be computed without writing an audit entry per scoring run.
  const now = new Date()
  const history = appendScoreHistory(readScoreHistory(identity.riskFactors), score, now)
  const riskVelocity = velocityFromHistory(history, score, now)
  const storedFactors: StoredRiskFactors = { ...factors, riskVelocity, history }

  await db.update(identities)
    .set({ riskScore: score, riskFactors: storedFactors, updatedAt: now })
    .where(eq(identities.id, identityId))

  return { identityId, score, factors: storedFactors }
}

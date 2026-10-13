/**
 * The AD tiering model, most privileged first.
 *
 *   Tier 0    identity plane: DCs, AD DS, Domain/Enterprise/Schema Admins
 *   Top Tier  Tier 0 adjacent: systems that can take over Tier 0 without being
 *             part of it — ADFS, Entra Connect, PKI/CA, PAM vaults, DC backup
 *   Tier 1    member servers and applications
 *   Tier 2    workstations and end users
 *
 * Code that orders or compares tiers uses these helpers rather than the enum
 * key: 'tier_top' does not sort or parse like the numbered tiers.
 */
export const AD_TIERS = ['tier_0', 'tier_top', 'tier_1', 'tier_2', 'unclassified'] as const
export type AdTier = typeof AD_TIERS[number]

/** Classified tiers only, most privileged first. */
export const CLASSIFIED_TIERS = ['tier_0', 'tier_top', 'tier_1', 'tier_2'] as const

/** 0 = most privileged; unclassified ranks last. */
export const TIER_RANK: Record<AdTier, number> = {
  tier_0: 0,
  tier_top: 1,
  tier_1: 2,
  tier_2: 3,
  unclassified: 4,
}

export function tierRank(tier: string | null | undefined): number {
  return TIER_RANK[(tier ?? 'unclassified') as AdTier] ?? TIER_RANK.unclassified
}

/** True when `a` is more privileged than `b`. */
export function isStricterTier(a: string | null | undefined, b: string | null | undefined): boolean {
  return tierRank(a) < tierRank(b)
}

/** The more privileged of two tiers. */
export function stricterTier<T extends string>(a: T, b: T): T {
  return tierRank(a) <= tierRank(b) ? a : b
}

/** Short badge label: T0, TOP, T1, T2. */
export const TIER_SHORT: Record<AdTier, string> = {
  tier_0: 'T0',
  tier_top: 'TOP',
  tier_1: 'T1',
  tier_2: 'T2',
  unclassified: '?',
}

/** Tier 0 and Top Tier: the control plane and what can take it over. */
export function isControlPlaneTier(tier: string | null | undefined): boolean {
  return tier === 'tier_0' || tier === 'tier_top'
}

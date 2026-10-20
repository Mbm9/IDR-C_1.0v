import { z } from 'zod'

// Sort order for GET /api/attack-paths.
// risk:   riskScore desc (default)
// length: pathLength desc, then riskScore desc
export const attackPathSortSchema = z.enum(['risk', 'length'])
export type AttackPathSort = z.infer<typeof attackPathSortSchema>

/** Missing/empty → 'risk'; unknown value → null (caller answers 400). */
export function parseAttackPathSort(raw: string | null | undefined): AttackPathSort | null {
  if (raw == null || raw === '') return 'risk'
  const parsed = attackPathSortSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * Columns to order by, all descending except the final `id` tiebreaker (ascending),
 * which keeps offset paging stable when many paths share a risk score.
 */
export function attackPathSortKeys(sort: AttackPathSort): Array<'pathLength' | 'riskScore' | 'id'> {
  return sort === 'length' ? ['pathLength', 'riskScore', 'id'] : ['riskScore', 'id']
}

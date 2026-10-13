import { timingSafeEqual } from 'node:crypto'

/**
 * Verify the `Authorization: Bearer <CRON_SECRET>` header sent by the
 * external scheduler that drives /api/cron/* jobs.
 *
 * Middleware lets /api/cron/* through without a session, so this check is
 * the only gate for those routes. With no CRON_SECRET configured the jobs
 * are allowed in development and denied in production.
 */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'

  const header = request.headers.get('authorization') ?? ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

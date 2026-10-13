/**
 * Print the GPO-to-account validation and policy compliance report as JSON
 * for the organization of SEED_ADMIN_EMAIL (default admin@acmefs.sa).
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/gpo-validation-report.ts > report.json
 *
 * Same logic as GET /api/reports/gpo-validation (lib/reports/gpo-validation.ts).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { buildGpoValidationReport, loadGpoValidationInput } from '@/lib/reports/gpo-validation'

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@acmefs.sa'
  const [user] = await db.select({ orgId: users.orgId }).from(users).where(eq(users.email, email)).limit(1)
  if (!user?.orgId) throw new Error(`No organization for ${email}`)
  const report = buildGpoValidationReport(await loadGpoValidationInput(user.orgId))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

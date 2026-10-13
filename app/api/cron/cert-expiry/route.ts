import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { entitlements } from '@/lib/db/schema'
import { eq, and, lt, sql } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const ninetyDaysAgo = sql`now() - interval '90 days'`

    const result = await db
      .update(entitlements)
      .set({ certificationStatus: 'expired' })
      .where(
        and(
          eq(entitlements.certifiable, true),
          eq(entitlements.certificationStatus, 'certified'),
          lt(entitlements.lastCertifiedAt, ninetyDaysAgo)
        )
      )
      .returning({ id: entitlements.id })

    return NextResponse.json({
      success: true,
      message: `Marked ${result.length} entitlements as expired`,
      count: result.length,
    })
  } catch (error) {
    console.error('Cert expiry cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Certification expiry check failed', error: String(error) },
      { status: 500 }
    )
  }
}

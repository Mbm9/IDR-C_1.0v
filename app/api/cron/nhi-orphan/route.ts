import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identities } from '@/lib/db/schema'
import { eq, and, or, isNull, sql, ne } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find NHI identities where:
    // 1. ownerIdentityId is NULL, or
    // 2. owner identity has status in ('disabled', 'inactive', 'suspended')
    const result = await db
      .update(identities)
      .set({ status: 'orphaned', updatedAt: new Date() })
      .where(
        and(
          eq(identities.type, 'non_human'),
          ne(identities.status, 'orphaned'), // don't re-flag already orphaned
          or(
            isNull(identities.ownerIdentityId),
            sql`${identities.ownerIdentityId} IN (
              SELECT ${identities.id} FROM ${identities}
              WHERE ${identities.status} IN ('disabled', 'inactive', 'suspended')
            )`
          )
        )
      )
      .returning({ id: identities.id })

    return NextResponse.json({
      success: true,
      message: `Flagged ${result.length} NHI identities as orphaned`,
      count: result.length,
    })
  } catch (error) {
    console.error('NHI orphan detector cron error:', error)
    return NextResponse.json(
      { success: false, message: 'NHI orphan detector failed', error: String(error) },
      { status: 500 }
    )
  }
}

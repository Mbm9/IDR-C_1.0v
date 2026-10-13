import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { integrationSources } from '@/lib/db/schema'
import { or, isNull, sql } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Flag integrations as stale (error) when:
    // 1. lastSyncAt is NULL, or
    // 2. lastSyncAt is older than 2x their sync frequency
    const result = await db
      .update(integrationSources)
      .set({ syncStatus: 'error' })
      .where(
        or(
          isNull(integrationSources.lastSyncAt),
          sql`${integrationSources.lastSyncAt} < now() - (${integrationSources.syncFrequencyMinutes} * 2 * interval '1 minute')`
        )
      )
      .returning({ id: integrationSources.id })

    return NextResponse.json({
      success: true,
      message: `Flagged ${result.length} integration sources as stale`,
      count: result.length,
    })
  } catch (error) {
    console.error('Sync health cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Sync health check failed', error: String(error) },
      { status: 500 }
    )
  }
}

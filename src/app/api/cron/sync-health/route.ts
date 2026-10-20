import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { integrationSources } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'
import { staleSyncReason } from '@/lib/connectors/sync-health'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Flag scheduled sources that missed their sync window (see staleSyncReason).
    // Disconnected / already-errored / manual sources are never touched, and every
    // flagged source gets a concrete lastSyncError.
    const candidates = await db
      .select({
        id: integrationSources.id,
        syncStatus: integrationSources.syncStatus,
        lastSyncAt: integrationSources.lastSyncAt,
        syncFrequencyMinutes: integrationSources.syncFrequencyMinutes,
        config: integrationSources.config,
      })
      .from(integrationSources)
      .where(inArray(integrationSources.syncStatus, ['connected', 'syncing']))

    const now = new Date()
    let count = 0
    for (const source of candidates) {
      const reason = staleSyncReason(source, now)
      if (!reason) continue
      const updated = await db
        .update(integrationSources)
        .set({ syncStatus: 'error', lastSyncError: reason })
        // Re-check status so a sync that just finished is not overwritten.
        .where(and(eq(integrationSources.id, source.id), eq(integrationSources.syncStatus, source.syncStatus)))
        .returning({ id: integrationSources.id })
      count += updated.length
    }

    return NextResponse.json({
      success: true,
      message: `Flagged ${count} integration sources as stale`,
      count,
    })
  } catch (error) {
    console.error('Sync health cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Sync health check failed', error: String(error) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identityEvents } from '@/lib/db/schema'
import { lt } from 'drizzle-orm'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    const deleted = await db
      .delete(identityEvents)
      .where(lt(identityEvents.eventTimestamp, ninetyDaysAgo))
      .returning({ id: identityEvents.id })

    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted.length} events older than 90 days`,
      count: deleted.length,
    })
  } catch (error) {
    console.error('Event cleanup cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Event cleanup failed', error: String(error) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { canaryTriggers, canaryIdentities } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Verify the canary belongs to the user's org
    const [canary] = await db
      .select({ id: canaryIdentities.id })
      .from(canaryIdentities)
      .where(and(eq(canaryIdentities.id, id), eq(canaryIdentities.orgId, session.user.orgId)))

    if (!canary) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const triggers = await db
      .select()
      .from(canaryTriggers)
      .where(eq(canaryTriggers.canaryId, id))
      .orderBy(desc(canaryTriggers.triggeredAt))
      .limit(100)

    return NextResponse.json({ items: triggers })
  } catch (error) {
    console.error('Canary triggers error:', error)
    return NextResponse.json({ error: 'Failed to load triggers' }, { status: 500 })
  }
}

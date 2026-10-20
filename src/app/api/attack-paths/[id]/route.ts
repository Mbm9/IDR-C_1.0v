import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { attackPaths, identities, resources } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const { id } = await params
    const orgId = session.user.orgId

    const [path] = await db
      .select()
      .from(attackPaths)
      .where(and(eq(attackPaths.id, id), eq(attackPaths.orgId, orgId)))

    if (!path) {
      return NextResponse.json({ error: 'Attack path not found' }, { status: 404 })
    }

    // Enrich with identity/resource names
    let sourceIdentity = null
    let targetIdentity = null
    let targetResource = null

    if (path.sourceIdentityId) {
      const [si] = await db
        .select({ id: identities.id, displayName: identities.displayName, adTier: identities.adTier, type: identities.type })
        .from(identities)
        .where(eq(identities.id, path.sourceIdentityId))
      sourceIdentity = si || null
    }

    if (path.targetIdentityId) {
      const [ti] = await db
        .select({ id: identities.id, displayName: identities.displayName, adTier: identities.adTier, type: identities.type })
        .from(identities)
        .where(eq(identities.id, path.targetIdentityId))
      targetIdentity = ti || null
    }

    if (path.targetResourceId) {
      const [tr] = await db
        .select({ id: resources.id, name: resources.name, adTier: resources.adTier, type: resources.type })
        .from(resources)
        .where(eq(resources.id, path.targetResourceId))
      targetResource = tr || null
    }

    return NextResponse.json({
      ...path,
      sourceIdentity,
      targetIdentity,
      targetResource,
    })
  } catch (error) {
    console.error('[AttackPaths] GET detail error:', error)
    return NextResponse.json({ error: 'Failed to load attack path' }, { status: 500 })
  }
}

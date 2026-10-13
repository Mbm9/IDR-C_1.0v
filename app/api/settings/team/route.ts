import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { users, invitations } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { logAction } from '@/lib/actions/helpers'

const APP_ROLES: AppRole[] = ['viewer', 'analyst', 'iam_admin', 'ciso', 'admin']
const isAppRole = (value: unknown): value is AppRole =>
  typeof value === 'string' && (APP_ROLES as string[]).includes(value)

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [teamMembers, pendingInvites] = await Promise.all([
    db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      appRole: users.appRole,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.orgId, session.user.orgId)),

    db.select().from(invitations)
      .where(and(eq(invitations.orgId, session.user.orgId), eq(invitations.status, 'pending'))),
  ])

  return NextResponse.json({ members: teamMembers, invitations: pendingInvites })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'admin'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, role } = await req.json()
  if (!email || !role) return NextResponse.json({ error: 'Email and role required' }, { status: 400 })
  if (!isAppRole(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const [invite] = await db.insert(invitations).values({
    email,
    role,
    orgId: session.user.orgId,
    invitedBy: session.user.id,
    expiresAt,
  }).returning()

  await logAction({
    actionType: 'invite_user',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    payload: { invitationId: invite.id, email, role },
  })

  return NextResponse.json({ invitation: invite })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'admin'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, role } = await req.json()
  if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 })
  if (!isAppRole(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  const [before] = await db.select({ appRole: users.appRole })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, session.user.orgId)))
    .limit(1)
  if (!before) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await db.update(users)
    .set({ appRole: role })
    .where(and(eq(users.id, userId), eq(users.orgId, session.user.orgId)))

  await logAction({
    actionType: 'change_role',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    payload: { userId, from: before.appRole, to: role },
  })

  return NextResponse.json({ success: true })
}

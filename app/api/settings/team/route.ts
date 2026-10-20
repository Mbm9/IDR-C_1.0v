import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { users, invitations, subscriptions } from '@/lib/db/schema'
import { eq, and, gt, count, sql } from 'drizzle-orm'
import { z } from 'zod'
import { hasRole, ROLE_HIERARCHY } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { logAction } from '@/lib/actions/helpers'
import { createInviteToken, inviteUrl, emailInvite } from '@/lib/auth/invite-token'
import { organizations } from '@/lib/db/schema'

/** Invitation columns safe to return (never the token hash). */
const invitationColumns = {
  id: invitations.id,
  email: invitations.email,
  role: invitations.role,
  status: invitations.status,
  invitedBy: invitations.invitedBy,
  expiresAt: invitations.expiresAt,
  createdAt: invitations.createdAt,
}

const APP_ROLES: AppRole[] = ['viewer', 'analyst', 'iam_admin', 'ciso', 'admin']
const isAppRole = (value: unknown): value is AppRole =>
  typeof value === 'string' && (APP_ROLES as string[]).includes(value)

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(['viewer', 'analyst', 'iam_admin', 'ciso', 'admin']),
})

const revokeInviteSchema = z.object({
  invitationId: z.string().uuid(),
})

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

    db.select(invitationColumns).from(invitations)
      .where(and(
        eq(invitations.orgId, session.user.orgId),
        eq(invitations.status, 'pending'),
        gt(invitations.expiresAt, new Date()),
      )),
  ])

  return NextResponse.json({ members: teamMembers, invitations: pendingInvites })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'admin'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.role) return NextResponse.json({ error: 'Email and role required' }, { status: 400 })
  if (!isAppRole(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  const { email, role } = parsed.data
  const orgId = session.user.orgId
  const actorRole = (session.user as any).appRole as AppRole

  // An inviter can never grant a role above their own.
  if (ROLE_HIERARCHY[role] > ROLE_HIERARCHY[actorRole]) {
    return NextResponse.json({ error: 'Cannot invite a role higher than your own' }, { status: 403 })
  }

  const now = new Date()
  const [[existingUser], [existingInvite], [sub], [members], [openInvites]] = await Promise.all([
    db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1),
    db.select({ id: invitations.id }).from(invitations)
      .where(and(
        eq(invitations.orgId, orgId),
        sql`lower(${invitations.email}) = ${email}`,
        eq(invitations.status, 'pending'),
        gt(invitations.expiresAt, now),
      ))
      .limit(1),
    db.select({ maxUsers: subscriptions.maxUsers }).from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1),
    db.select({ total: count() }).from(users).where(eq(users.orgId, orgId)),
    db.select({ total: count() }).from(invitations)
      .where(and(eq(invitations.orgId, orgId), eq(invitations.status, 'pending'), gt(invitations.expiresAt, now))),
  ])

  if (existingUser) {
    return NextResponse.json({ error: 'A user with this email already has an account' }, { status: 409 })
  }
  if (existingInvite) {
    return NextResponse.json({ error: 'A pending invitation already exists for this email' }, { status: 409 })
  }
  // Seats: current members plus outstanding invitations may not exceed maxUsers.
  if (sub?.maxUsers != null && Number(members?.total ?? 0) + Number(openInvites?.total ?? 0) >= sub.maxUsers) {
    return NextResponse.json({ error: 'User limit reached for your subscription' }, { status: 403 })
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { token, tokenHash } = createInviteToken()
  const [invite] = await db.insert(invitations).values({
    email,
    role,
    orgId,
    invitedBy: session.user.id,
    tokenHash,
    expiresAt,
  }).returning(invitationColumns)

  const url = inviteUrl(token)
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1)
  const emailed = await emailInvite({ to: email, url, orgName: org?.name, role })

  await logAction({
    actionType: 'invite_user',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    payload: { operation: 'created', invitationId: invite.id, email, role, emailed },
  })

  // The link is returned once so the admin can share it; only its hash is stored.
  return NextResponse.json({ invitation: invite, inviteUrl: url, emailed })
}

/** Revoke a pending invitation (admin only). Body: { invitationId }. */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'admin'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = revokeInviteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invitationId required' }, { status: 400 })
  const { invitationId } = parsed.data

  const revoked = await db.update(invitations)
    .set({ status: 'revoked' })
    .where(and(
      eq(invitations.id, invitationId),
      eq(invitations.orgId, session.user.orgId),
      eq(invitations.status, 'pending'),
    ))
    .returning({ id: invitations.id, email: invitations.email, role: invitations.role })

  if (revoked.length === 0) {
    return NextResponse.json({ error: 'Pending invitation not found' }, { status: 404 })
  }

  await logAction({
    actionType: 'invite_user',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    payload: { operation: 'revoked', invitationId, email: revoked[0].email, role: revoked[0].role },
  })

  return NextResponse.json({ success: true })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'admin'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, role } = await req.json()
  if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 })
  if (!isAppRole(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  // No one changes their own role: an admin can't lock themselves out, and roles are granted by someone else.
  if (userId === session.user.id) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 403 })
  }

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

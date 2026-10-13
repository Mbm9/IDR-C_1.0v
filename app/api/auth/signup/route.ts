import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { users, invitations, subscriptions, organizations, actionLog } from '@/lib/db/schema'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { hashInviteToken } from '@/lib/auth/invite-token'
import type { AppRole } from '@/lib/utils/rbac'

const APP_ROLES: AppRole[] = ['viewer', 'analyst', 'iam_admin', 'ciso', 'admin']
const isAppRole = (value: unknown): value is AppRole =>
  typeof value === 'string' && (APP_ROLES as string[]).includes(value)

const signupSchema = z.object({
  name: z.string().trim().max(200).nullish(),
  email: z.string().trim().min(1).max(320).email(),
  password: z.string().max(200),
  // Token from the invite link (/signup?invite=...). Required to join an
  // existing organization; knowing an invited email address is not enough.
  inviteToken: z.string().trim().min(16).max(200).nullish(),
})

/** Thrown inside the join transaction to abort it with an HTTP response. */
class SignupRejected extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const SEAT_LIMIT_MESSAGE =
  'This organization has reached its user limit. Ask an administrator to free a seat or upgrade the plan.'

/**
 * Create an account.
 *
 * - If the email has a pending, unexpired invitation, the user joins the
 *   inviting organization with the invited role (no new organization or
 *   subscription), the invitation is marked accepted and the join is audited
 *   as `invite_user` { operation: 'accepted' }. The org's subscription
 *   maxUsers is enforced.
 * - Pending invitations past their expiry are marked `expired` and ignored.
 * - Otherwise the user is created without an organization and becomes admin
 *   of the organization they create in onboarding.
 *
 * Whether an email was invited is only revealed in the response to the
 * account that was just created for it, never to anonymous lookups.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body?.email || !body?.password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 })
    }
    const { name, email, password, inviteToken } = parsed.data
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const emailKey = email.toLowerCase()

    // Check if user already exists (case-insensitive, so Ali@x and ali@x
    // cannot become two accounts).
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${emailKey}`)
      .limit(1)

    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    // Pending invitations for this email, newest first (expired ones are marked).
    const now = new Date()
    const pending = await db
      .select()
      .from(invitations)
      .where(and(sql`lower(${invitations.email}) = ${emailKey}`, eq(invitations.status, 'pending')))
      .orderBy(desc(invitations.createdAt))

    const expiredIds = pending.filter((i) => new Date(i.expiresAt) <= now).map((i) => i.id)
    if (expiredIds.length > 0) {
      await db.update(invitations)
        .set({ status: 'expired' })
        .where(and(inArray(invitations.id, expiredIds), eq(invitations.status, 'pending')))
    }

    // Joining requires the invite link's token, and the link must belong to
    // this email. Without a token the account is created normally.
    let invitation: (typeof pending)[number] | undefined
    if (inviteToken) {
      const tokenHash = hashInviteToken(inviteToken)
      invitation = pending.find((i) => i.tokenHash === tokenHash && new Date(i.expiresAt) > now)
      if (!invitation) {
        return NextResponse.json({
          error: 'This invitation link is invalid, expired or was issued for a different email address.',
        }, { status: 400 })
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    if (!invitation) {
      const [user] = await db.insert(users).values({
        name: name || null,
        email,
        hashedPassword,
        appRole: 'admin', // Becomes admin of the org they create in onboarding
      }).returning({ id: users.id })

      return NextResponse.json({ userId: user.id, joinedOrganization: null }, { status: 201 })
    }

    const role: AppRole = isAppRole(invitation.role) ? invitation.role : 'viewer'
    const orgId = invitation.orgId

    const userId = await db.transaction(async (tx) => {
      // Lock the subscription row so concurrent joins cannot overshoot maxUsers.
      const [sub] = await tx
        .select({ maxUsers: subscriptions.maxUsers })
        .from(subscriptions)
        .where(eq(subscriptions.orgId, orgId))
        .for('update')
      if (sub?.maxUsers != null) {
        const [members] = await tx.select({ total: count() }).from(users).where(eq(users.orgId, orgId))
        if (Number(members?.total ?? 0) >= sub.maxUsers) {
          throw new SignupRejected(403, SEAT_LIMIT_MESSAGE)
        }
      }

      const accepted = await tx.update(invitations)
        .set({ status: 'accepted' })
        .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')))
        .returning({ id: invitations.id })
      if (accepted.length === 0) {
        throw new SignupRejected(409, 'This invitation is no longer valid. Ask an administrator for a new one.')
      }

      const [user] = await tx.insert(users).values({
        name: name || null,
        email,
        hashedPassword,
        appRole: role,
        orgId,
      }).returning({ id: users.id })

      await tx.insert(actionLog).values({
        actionType: 'invite_user',
        actorIdentityId: user.id,
        orgId,
        payload: { operation: 'accepted', invitationId: invitation.id, role, email, invitedBy: invitation.invitedBy },
        source: 'manual',
      })

      return user.id
    })

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)

    return NextResponse.json({
      userId,
      joinedOrganization: { id: orgId, name: org?.name ?? null, role },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof SignupRejected) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }
    console.error('Signup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

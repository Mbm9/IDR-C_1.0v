import { NextResponse } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { invitations, organizations } from '@/lib/db/schema'
import { hashInviteToken } from '@/lib/auth/invite-token'

// Reads the database per request; never prerender at build time.
export const dynamic = 'force-dynamic'

const tokenSchema = z.string().trim().min(16).max(200)

/**
 * GET /api/auth/invite?token=… — what an invite link is for, so the sign-up
 * page can say "Join <org> as <role>" and fill in the invited email.
 *
 * Only the holder of the link's token (32 random bytes, stored hashed) can look
 * it up. Unknown, used, revoked and expired tokens all get the same 404, so the
 * response never reveals whether an invitation existed.
 */
export const GET = withApiHandler(async (req) => {
  const parsed = tokenSchema.safeParse(new URL(req.url).searchParams.get('token'))
  const notFound = NextResponse.json({ error: 'Invitation not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  if (!parsed.success) return notFound

  const [invite] = await db
    .select({ email: invitations.email, role: invitations.role, orgName: organizations.name, brandName: organizations.brandName })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(and(
      eq(invitations.tokenHash, hashInviteToken(parsed.data)),
      eq(invitations.status, 'pending'),
      gt(invitations.expiresAt, new Date()),
    ))
    .limit(1)
  if (!invite) return notFound

  return NextResponse.json(
    { email: invite.email, role: invite.role, organization: invite.brandName || invite.orgName },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}, { public: true })

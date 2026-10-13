import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { organizations, users, subscriptions, integrationSources, invitations, integrationTypeEnum } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { hasRole, ROLE_HIERARCHY } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { prepareConnectorConfig, ConnectorConfigError } from '@/lib/connectors/store-config'
import { logAction } from '@/lib/actions/helpers'

const appRoleSchema = z.enum(['viewer', 'analyst', 'iam_admin', 'ciso', 'admin'])

const organizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().min(1).max(253),
  industry: z.string().trim().max(100).optional(),
  regulatoryFrameworks: z.array(z.string().max(50)).max(20).optional(),
})

const integrationSchema = z.object({
  type: z.enum(integrationTypeEnum.enumValues),
  name: z.string().trim().min(1).max(200),
  config: z.record(z.string(), z.unknown()).optional(),
})

const teamSchema = z.object({
  members: z.array(z.object({
    email: z.string().trim().email().max(320),
    role: appRoleSchema.default('viewer'),
  })).min(1).max(50),
})

function invalid(error: z.ZodError) {
  return NextResponse.json({ error: 'Invalid request', details: error.flatten() }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const step = body?.step
  const data = body?.data
  const appRole = (session.user.appRole ?? 'viewer') as AppRole

  if (step === 'organization') {
    const parsed = organizationSchema.safeParse(data)
    if (!parsed.success) return invalid(parsed.error)

    // Only a user without an organization may create one; otherwise any member
    // could mint a new org and promote themselves to admin of it.
    const [current] = await db.select({ orgId: users.orgId })
      .from(users).where(eq(users.id, session.user.id)).limit(1)
    if (current?.orgId || session.user.orgId) {
      return NextResponse.json({ error: 'You already belong to an organization' }, { status: 409 })
    }

    const { name, domain, industry, regulatoryFrameworks } = parsed.data
    const org = await db.transaction(async (tx) => {
      const [created] = await tx.insert(organizations).values({
        name,
        domain,
        industry,
        regulatoryFrameworks: regulatoryFrameworks || [],
      }).returning()

      await tx.insert(subscriptions).values({
        orgId: created.id,
        tier: 'free',
        maxIdentities: 500,
        maxIntegrations: 1,
        maxUsers: 3,
        maxAiRunsPerMonth: 5,
        retentionDays: 30,
      })

      await tx.update(users)
        .set({ orgId: created.id, appRole: 'admin' })
        .where(eq(users.id, session.user.id))

      return created
    })

    return NextResponse.json({ orgId: org.id, refreshSession: true })
  }

  if (step === 'integration') {
    const orgId = session.user.orgId
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })
    // Same guard as POST /api/integrations
    if (!hasRole(appRole, 'iam_admin')) {
      return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
    }

    const parsed = integrationSchema.safeParse(data)
    if (!parsed.success) return invalid(parsed.error)
    const { type, name, config } = parsed.data

    let storedConfig: Record<string, unknown> | string
    try {
      storedConfig = prepareConnectorConfig(config)
    } catch (e) {
      if (e instanceof ConnectorConfigError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }

    const [source] = await db.insert(integrationSources).values({
      name,
      type,
      config: storedConfig,
      syncStatus: 'disconnected',
      orgId,
    }).returning()

    await logAction({
      actionType: 'manage_integration',
      actorIdentityId: session.user.id,
      orgId,
      payload: { operation: 'create', integrationId: source.id, name, type, via: 'onboarding' },
    })

    return NextResponse.json({ integrationId: source.id })
  }

  if (step === 'team') {
    const orgId = session.user.orgId
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })
    // Same guard as POST /api/settings/team
    if (!hasRole(appRole, 'admin')) {
      return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 })
    }

    const parsed = teamSchema.safeParse(data)
    if (!parsed.success) return invalid(parsed.error)

    // An inviter can never grant a role above their own.
    if (parsed.data.members.some((m) => ROLE_HIERARCHY[m.role] > ROLE_HIERARCHY[appRole])) {
      return NextResponse.json({ error: 'Cannot invite a role higher than your own' }, { status: 403 })
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    const inviteValues = parsed.data.members.map((m) => ({
      email: m.email.toLowerCase(),
      role: m.role,
      orgId,
      invitedBy: session.user.id,
      status: 'pending' as const,
      expiresAt,
    }))

    await db.insert(invitations).values(inviteValues)
    await logAction({
      actionType: 'invite_user',
      actorIdentityId: session.user.id,
      orgId,
      payload: { via: 'onboarding', invites: inviteValues.map(({ email, role }) => ({ email, role })) },
    })

    return NextResponse.json({ invited: inviteValues.length })
  }

  return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
}

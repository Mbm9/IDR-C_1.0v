import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { withApiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { logAction } from '@/lib/actions/helpers'
import { brandingUpdateSchema, base64Bytes } from '@/lib/branding'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/organization — the caller's organization and its branding.
 * Any member may read it (the sidebar and Settings show it).
 */
export const GET = withApiHandler(async (_req: NextRequest, { orgId }) => {
  const [org] = await db
    .select({
      name: organizations.name,
      domain: organizations.domain,
      industry: organizations.industry,
      regulatoryFrameworks: organizations.regulatoryFrameworks,
      adForestName: organizations.adForestName,
      brandName: organizations.brandName,
      brandLogo: organizations.brandLogo,
      brandUpdatedAt: organizations.brandUpdatedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const { brandName, brandLogo, brandUpdatedAt, ...organization } = org
  return NextResponse.json({
    organization,
    branding: { name: brandName, logo: brandLogo, updatedAt: brandUpdatedAt },
  })
})

/**
 * PUT /api/settings/organization — update branding (admin only).
 * Body: { name?: string | null, logo?: string | null }; null resets to the default.
 */
export const PUT = withApiHandler(async (req: NextRequest, { orgId, session, log }) => {
  const parsed = brandingUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid branding', details: parsed.error.flatten() }, { status: 400 })
  }
  const { name, logo } = parsed.data

  const [before] = await db
    .select({ name: organizations.brandName, logo: organizations.brandLogo })
    .from(organizations).where(eq(organizations.id, orgId)).limit(1)

  const values: Partial<typeof organizations.$inferInsert> = { brandUpdatedAt: new Date() }
  if (name !== undefined) values.brandName = name
  if (logo !== undefined) values.brandLogo = logo
  const [after] = await db.update(organizations).set(values)
    .where(eq(organizations.id, orgId))
    .returning({ name: organizations.brandName, logo: organizations.brandLogo, updatedAt: organizations.brandUpdatedAt })

  // Audit: what changed, never the image itself.
  const logoInfo = (v: string | null | undefined) =>
    v ? { type: v.slice(5, v.indexOf(';')), bytes: base64Bytes(v.slice(v.indexOf(',') + 1)) } : null
  await logAction({
    actionType: 'manage_branding',
    actorIdentityId: session.user.id,
    orgId,
    payload: {
      operation: 'updated',
      ...(name !== undefined && { name: { from: before?.name ?? null, to: name } }),
      ...(logo !== undefined && { logo: { from: logoInfo(before?.logo), to: logoInfo(logo) } }),
    },
  })
  log.info('Branding updated', { nameChanged: name !== undefined, logoChanged: logo !== undefined })

  return NextResponse.json({ branding: after })
}, { requiredRole: 'admin' })

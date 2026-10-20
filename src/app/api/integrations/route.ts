import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { integrationSources } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { prepareConnectorConfig, ConnectorConfigError } from '@/lib/connectors/store-config'
import { logAction } from '@/lib/actions/helpers'

export async function GET() {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sources = await db.select().from(integrationSources)
    .where(eq(integrationSources.orgId, session.user.orgId))

  // Strip credentials from response — never expose to frontend
  const sanitized = sources.map(({ config, ...rest }) => ({
    ...rest,
    // Encrypted configs are non-empty strings; legacy plaintext configs are objects.
    // Decrypting here only to compute a boolean would 500 the whole list on a key rotation.
    hasCredentials: typeof config === 'string'
      ? config.length > 0
      : !!config && typeof config === 'object' && Object.keys(config).length > 0,
  }))

  return NextResponse.json({ sources: sanitized })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, type, config, syncFrequencyMinutes } = body

    if (!name || !type) {
      return NextResponse.json({ error: 'Missing name or type' }, { status: 400 })
    }

    // SSRF guard + credential encryption (fails closed in production)
    let storedConfig: Record<string, unknown> | string
    try {
      storedConfig = prepareConnectorConfig(config)
    } catch (e) {
      if (e instanceof ConnectorConfigError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }

    const [created] = await db.insert(integrationSources).values({
      name,
      type,
      config: storedConfig,
      syncStatus: 'connected',
      syncFrequencyMinutes: syncFrequencyMinutes || 360,
      orgId: session.user.orgId,
    }).returning()

    await logAction({
      actionType: 'manage_integration',
      actorIdentityId: session.user.id,
      orgId: session.user.orgId,
      payload: { operation: 'create', integrationId: created.id, name, type },
    })

    return NextResponse.json({ integration: { ...created, config: undefined } }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to create integration' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { integrationSources } from '@/lib/db/schema'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { prepareConnectorConfig, ConnectorConfigError } from '@/lib/connectors/store-config'
import { logAction } from '@/lib/actions/helpers'

const updateIntegrationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  config: z.record(z.string(), z.string()).optional(),
  syncFrequencyMinutes: z.number().int().min(15).max(10080).optional(),
}).refine((v) => v.name !== undefined || v.config !== undefined || v.syncFrequencyMinutes !== undefined, {
  message: 'Nothing to update',
})

/**
 * Edit / reconnect an integration: rename it, change the sync frequency, or
 * replace its connection details. New credentials go through the same SSRF
 * guard and encryption as POST /api/integrations. Replacing credentials
 * resets the status to "disconnected" and clears the last sync error until
 * the next sync runs.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
  }

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = updateIntegrationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  }
  const { name, config, syncFrequencyMinutes } = parsed.data

  const [existing] = await db.select({ id: integrationSources.id, name: integrationSources.name, type: integrationSources.type })
    .from(integrationSources)
    .where(and(eq(integrationSources.id, id), eq(integrationSources.orgId, session.user.orgId)))
  if (!existing) return NextResponse.json({ error: 'Integration not found' }, { status: 404 })

  const update: Partial<typeof integrationSources.$inferInsert> = {}
  if (name !== undefined) update.name = name
  if (syncFrequencyMinutes !== undefined) update.syncFrequencyMinutes = syncFrequencyMinutes
  if (config !== undefined) {
    try {
      update.config = prepareConnectorConfig(config)
    } catch (e) {
      if (e instanceof ConnectorConfigError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }
    update.syncStatus = 'disconnected'
    update.lastSyncError = null
  }

  const [updated] = await db.update(integrationSources)
    .set(update)
    .where(eq(integrationSources.id, id))
    .returning()

  await logAction({
    actionType: 'manage_integration',
    actorIdentityId: session.user.id,
    orgId: session.user.orgId,
    payload: {
      operation: 'update',
      integrationId: id,
      name: updated.name,
      type: existing.type,
      // Field names only — never credential values
      changed: Object.keys(update).filter((k) => k !== 'config').concat(config !== undefined ? ['credentials'] : []),
    },
  })

  const { config: _omit, ...rest } = updated
  void _omit
  return NextResponse.json({ integration: { ...rest, hasCredentials: config !== undefined ? Object.keys(config).length > 0 : undefined } })
}

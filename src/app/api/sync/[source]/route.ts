import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { integrationSources, actionLog } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { createConnector } from '@/lib/connectors/factory'
import { syncToDatabase } from '@/lib/connectors/transformer'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { safeDecryptCredentials } from '@/lib/crypto/credentials'
import { summarizeSyncError, summarizeRecordErrors } from '@/lib/connectors/sync-error'
import { z } from 'zod'

const syncRequestSchema = z.object({ integrationId: z.string().uuid() })

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ source: string }> }
) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return NextResponse.json({ error: 'Forbidden: iam_admin role required to trigger sync' }, { status: 403 })
  }

  const { source: sourceType } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = syncRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'integrationId (uuid) is required' }, { status: 400 })
  }
  const { integrationId } = parsed.data

  // Verify the integration belongs to this org
  const [integration] = await db
    .select()
    .from(integrationSources)
    .where(
      and(
        eq(integrationSources.id, integrationId),
        eq(integrationSources.orgId, session.user.orgId)
      )
    )

  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  }

  // Set status to syncing
  await db
    .update(integrationSources)
    .set({ syncStatus: 'syncing' })
    .where(eq(integrationSources.id, integrationId))

  try {
    // Decrypt and create connector from stored config
    const config = safeDecryptCredentials(integration.config) as Record<string, string>
    const connector = createConnector({
      type: integration.type as any,
      credentials: config,
    })

    // Extract data from source
    const [rawIdentities, rawGroups] = await Promise.all([
      connector.extractIdentities(),
      connector.extractGroups(),
    ])

    // Transform and load into database
    const result = await syncToDatabase(
      session.user.orgId,
      integration.type,
      rawIdentities,
      rawGroups,
    )

    // Update integration status (record-level errors keep a short, credential-free note)
    const now = new Date()
    const lastSyncError = summarizeRecordErrors(result.errors)
    await db
      .update(integrationSources)
      .set({
        syncStatus: result.errors.length > 0 ? 'error' : 'connected',
        lastSyncAt: now,
        lastSyncRecordCount: result.identitiesUpserted + result.groupsUpserted,
        lastSyncError,
      })
      .where(eq(integrationSources.id, integrationId))

    // Log the action
    await db.insert(actionLog).values({
      actionType: 'sync_source',
      actorIdentityId: session.user.id,
      source: 'manual',
      orgId: session.user.orgId,
      payload: {
        integrationId,
        sourceType,
        integrationName: integration.name,
        result,
      },
      rationale: `Sync completed: ${result.identitiesUpserted} identities, ${result.groupsUpserted} groups (${result.duration}ms)`,
    })

    return NextResponse.json({
      success: true,
      result,
      integration: {
        id: integrationId,
        syncStatus: result.errors.length > 0 ? 'error' : 'connected',
        lastSyncAt: now.toISOString(),
        lastSyncRecordCount: result.identitiesUpserted + result.groupsUpserted,
        lastSyncError,
      },
    })
  } catch (err: unknown) {
    // Mark as error with a short reason the UI can show (never raw credentials)
    const lastSyncError = summarizeSyncError(err)
    await db
      .update(integrationSources)
      .set({ syncStatus: 'error', lastSyncError })
      .where(eq(integrationSources.id, integrationId))

    // Log the failure
    await db.insert(actionLog).values({
      actionType: 'sync_source',
      actorIdentityId: session.user.id,
      source: 'manual',
      orgId: session.user.orgId,
      payload: { integrationId, sourceType, error: lastSyncError },
      rationale: `Sync failed for ${integration.name}: ${lastSyncError}`,
    })

    return NextResponse.json({
      success: false,
      error: lastSyncError,
      integration: { id: integrationId, syncStatus: 'error', lastSyncError },
    }, { status: 500 })
  }
}

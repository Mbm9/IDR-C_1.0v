import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { integrationSources } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { executeSync } from '@/lib/connectors/sync-engine'
import type { SyncProgress } from '@/lib/connectors/base'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { safeDecryptCredentials } from '@/lib/crypto/credentials'
import { summarizeSyncError } from '@/lib/connectors/sync-error'
import { logAction } from '@/lib/actions/helpers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Running a sync writes identities and calls out to the source — same role as POST /api/sync/[source]
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return new Response(JSON.stringify({ error: 'Forbidden: iam_admin role required to trigger sync' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const integrationId = req.nextUrl.searchParams.get('integrationId')
  if (!integrationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(integrationId)) {
    return new Response(JSON.stringify({ error: 'integrationId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const orgId = session.user.orgId

  // Verify integration belongs to this org
  const [integration] = await db
    .select()
    .from(integrationSources)
    .where(
      and(
        eq(integrationSources.id, integrationId),
        eq(integrationSources.orgId, orgId),
      ),
    )

  if (!integration) {
    return new Response(JSON.stringify({ error: 'Integration not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Stored configs are encrypted (prepareConnectorConfig); legacy plaintext objects pass through
  const config = safeDecryptCredentials(integration.config) as Record<string, string>
  const actorId = session.user.id

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const sendEvent = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Stream may be closed
        }
      }

      const onProgress: (progress: SyncProgress) => void = (progress) => {
        sendEvent({
          phase: progress.phase,
          progress: progress.current,
          total: progress.total,
          message: progress.message,
        })
      }

      executeSync({
        orgId,
        integrationId,
        config: {
          type: integration.type as any,
          credentials: config,
        },
        onProgress,
      })
        .then(async (report) => {
          await logAction({
            actionType: 'sync_source',
            actorIdentityId: actorId,
            orgId,
            payload: {
              integrationId,
              sourceType: integration.type,
              integrationName: integration.name,
              identitiesUpserted: report.identitiesUpserted,
              groupsUpserted: report.groupsUpserted,
              entitlementsUpserted: report.entitlementsUpserted,
              errorCount: report.errors.length,
              via: 'stream',
            },
            rationale: `Sync completed: ${report.identitiesUpserted} identities, ${report.groupsUpserted} groups (${report.duration}ms)`,
          }).catch(() => {})
          sendEvent({
            phase: 'complete',
            summary: {
              identitiesUpserted: report.identitiesUpserted,
              groupsUpserted: report.groupsUpserted,
              entitlementsUpserted: report.entitlementsUpserted,
              errors: report.errors,
              duration: report.duration,
            },
          })
          controller.close()
        })
        .catch(async (err) => {
          const reason = summarizeSyncError(err)
          await logAction({
            actionType: 'sync_source',
            actorIdentityId: actorId,
            orgId,
            payload: { integrationId, sourceType: integration.type, error: reason, via: 'stream' },
            rationale: `Sync failed for ${integration.name}: ${reason}`,
          }).catch(() => {})
          sendEvent({
            phase: 'error',
            error: reason,
          })
          controller.close()
        })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

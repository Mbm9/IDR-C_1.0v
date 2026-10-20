import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { identityThreats, identities } from '@/lib/db/schema'
import { eq, desc, gt, and } from 'drizzle-orm'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'threat-stream' })

/**
 * GET /api/threats/stream
 *
 * Server-Sent Events (SSE) endpoint for real-time threat alerts.
 * Polls the database every 5 seconds and pushes new threats to
 * connected clients. Much simpler than WebSocket for Next.js and
 * works behind reverse proxies without special configuration.
 *
 * Client usage:
 *   const source = new EventSource('/api/threats/stream')
 *   source.onmessage = (e) => {
 *     const threats = JSON.parse(e.data)
 *     // Update UI with new threats
 *   }
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const orgId = session.user.orgId
  const encoder = new TextEncoder()
  let lastCheckAt = new Date()
  let isAborted = false

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial keepalive
      controller.enqueue(encoder.encode(': connected\n\n'))

      log.info('SSE client connected', { orgId })

      const poll = async () => {
        if (isAborted) return

        try {
          // Fetch threats newer than last check
          const newThreats = await db
            .select({
              id: identityThreats.id,
              threatType: identityThreats.threatType,
              severity: identityThreats.severity,
              status: identityThreats.status,
              identityId: identityThreats.identityId,
              identityName: identities.displayName,
              identityTier: identities.adTier,
              killChainPhase: identityThreats.killChainPhase,
              confidence: identityThreats.confidence,
              sourceIp: identityThreats.sourceIp,
              targetResource: identityThreats.targetResource,
              firstSeenAt: identityThreats.firstSeenAt,
              lastSeenAt: identityThreats.lastSeenAt,
            })
            .from(identityThreats)
            .leftJoin(identities, eq(identityThreats.identityId, identities.id))
            .where(and(
              eq(identityThreats.orgId, orgId),
              gt(identityThreats.lastSeenAt, lastCheckAt),
            ))
            .orderBy(desc(identityThreats.lastSeenAt))
            .limit(20)

          if (newThreats.length > 0) {
            const event = `data: ${JSON.stringify(newThreats)}\n\n`
            controller.enqueue(encoder.encode(event))
            lastCheckAt = new Date()
          } else {
            // Send keepalive comment every 30s
            controller.enqueue(encoder.encode(': heartbeat\n\n'))
          }
        } catch (err: any) {
          if (!isAborted) {
            log.error('SSE poll error', { error: err.message })
            const errorEvent = `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`
            controller.enqueue(encoder.encode(errorEvent))
          }
        }

        // Poll every 5 seconds
        if (!isAborted) {
          setTimeout(poll, 5000)
        }
      }

      // Start polling
      poll()

      // Handle client disconnect
      req.signal.addEventListener('abort', () => {
        isAborted = true
        log.info('SSE client disconnected', { orgId })
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

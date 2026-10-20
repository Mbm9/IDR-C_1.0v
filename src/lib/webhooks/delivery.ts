/**
 * Webhook Delivery System
 *
 * Manages webhook event dispatch with:
 * - Delivery tracking (success/failure/retries)
 * - Exponential backoff retry (3 attempts)
 * - Dead letter queue for failed deliveries
 * - HMAC-SHA256 signature verification
 * - Event type filtering per endpoint
 */

import { db } from '@/lib/db'
import { webhookEndpoints } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { sendWebhook } from './sender'
import { logger } from '@/lib/logger'

export type WebhookEventType =
  | 'threat.detected'
  | 'threat.resolved'
  | 'violation.created'
  | 'violation.remediated'
  | 'identity.created'
  | 'identity.disabled'
  | 'identity.risk_changed'
  | 'sync.completed'
  | 'sync.failed'
  | 'certification.expired'
  | 'tier_violation.detected'
  | 'automation.triggered'

export interface WebhookEvent {
  id: string
  type: WebhookEventType
  timestamp: string
  orgId: string
  data: Record<string, unknown>
}

export interface DeliveryRecord {
  eventId: string
  endpointId: string
  url: string
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  lastAttemptAt: string
  lastError?: string
  deliveredAt?: string
}

// In-memory delivery log (ring buffer, max 1000 entries)
const deliveryLog: DeliveryRecord[] = []
const MAX_LOG_SIZE = 1000

// Dead letter queue for permanently failed deliveries
const deadLetterQueue: DeliveryRecord[] = []
const MAX_DLQ_SIZE = 200

const log = logger.child({ module: 'webhooks' })

/**
 * Dispatch an event to all matching webhook endpoints for the org.
 */
export async function dispatchWebhookEvent(event: WebhookEvent): Promise<{
  dispatched: number
  delivered: number
  failed: number
}> {
  // Fetch active endpoints for this org
  const endpoints = await db.select()
    .from(webhookEndpoints)
    .where(and(
      eq(webhookEndpoints.orgId, event.orgId),
      eq(webhookEndpoints.enabled, true),
    ))

  let delivered = 0
  let failed = 0

  for (const endpoint of endpoints) {
    // Check if endpoint subscribes to this event type
    const subscribedEvents = (endpoint.events as string[]) || []
    if (subscribedEvents.length > 0 && !subscribedEvents.includes(event.type) && !subscribedEvents.includes('*')) {
      continue
    }

    const record: DeliveryRecord = {
      eventId: event.id,
      endpointId: endpoint.id,
      url: endpoint.url,
      status: 'pending',
      attempts: 0,
      lastAttemptAt: new Date().toISOString(),
    }

    // Attempt delivery with exponential backoff
    const payload = {
      event: event.type,
      timestamp: event.timestamp,
      data: event.data,
    }

    let success = false
    const maxAttempts = 3
    const backoffMs = [0, 2000, 8000] // immediate, 2s, 8s

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, backoffMs[attempt]))
      }

      record.attempts = attempt + 1
      record.lastAttemptAt = new Date().toISOString()

      try {
        success = await sendWebhook(
          endpoint.url,
          payload,
          (endpoint as any).secret || undefined,
        )

        if (success) {
          record.status = 'delivered'
          record.deliveredAt = new Date().toISOString()
          delivered++
          log.info('Webhook delivered', {
            eventType: event.type,
            url: endpoint.url,
            attempts: record.attempts,
          })
          break
        }
      } catch (err: any) {
        record.lastError = err.message
      }
    }

    if (!success) {
      record.status = 'failed'
      failed++

      // Add to dead letter queue
      deadLetterQueue.push(record)
      if (deadLetterQueue.length > MAX_DLQ_SIZE) {
        deadLetterQueue.splice(0, deadLetterQueue.length - MAX_DLQ_SIZE)
      }

      log.error('Webhook delivery failed permanently', {
        eventType: event.type,
        url: endpoint.url,
        attempts: record.attempts,
        lastError: record.lastError,
      })
    }

    // Track in delivery log
    deliveryLog.push(record)
    if (deliveryLog.length > MAX_LOG_SIZE) {
      deliveryLog.splice(0, deliveryLog.length - MAX_LOG_SIZE)
    }
  }

  return { dispatched: endpoints.length, delivered, failed }
}

/**
 * Helper to create and dispatch a webhook event.
 */
export async function emitWebhookEvent(
  type: WebhookEventType,
  orgId: string,
  data: Record<string, unknown>,
) {
  const event: WebhookEvent = {
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    orgId,
    data,
  }
  return dispatchWebhookEvent(event)
}

/**
 * Get recent delivery log entries.
 */
export function getDeliveryLog(limit = 50): DeliveryRecord[] {
  return deliveryLog.slice(-limit).reverse()
}

/**
 * Get dead letter queue (failed deliveries).
 */
export function getDeadLetterQueue(limit = 50): DeliveryRecord[] {
  return deadLetterQueue.slice(-limit).reverse()
}

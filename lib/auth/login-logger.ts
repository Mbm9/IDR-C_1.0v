/**
 * Login Attempt Logger
 *
 * Logs successful and failed login attempts to the action_log table
 * with IP address, user agent, and email for security auditing.
 */

import { db } from '@/lib/db'
import { actionLog } from '@/lib/db/schema'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'auth' })

export async function logLoginAttempt(params: {
  userId: string | null
  email: string
  success: boolean
  ip?: string
  userAgent?: string
  orgId?: string | null
}): Promise<void> {
  try {
    const actionType = params.success ? 'login_success' : 'login_failed'

    // action_log.org_id is a foreign key: attempts that cannot be tied to a
    // known user in an organization go to the application log only.
    if (params.userId && params.orgId) await db.insert(actionLog).values({
      actionType,
      actorIdentityId: params.userId,
      orgId: params.orgId,
      source: 'manual',
      rationale: params.success
        ? `Successful login for ${params.email}`
        : `Failed login attempt for ${params.email}`,
      payload: {
        email: params.email,
        ip: params.ip || 'unknown',
        userAgent: params.userAgent || 'unknown',
        timestamp: new Date().toISOString(),
      },
    })

    if (params.success) {
      log.info('Login successful', { email: params.email, ip: params.ip })
    } else {
      log.warn('Login failed', { email: params.email, ip: params.ip })
    }
  } catch (err: any) {
    // Never let logging break the auth flow
    log.error('Failed to log login attempt', { error: err.message })
  }
}

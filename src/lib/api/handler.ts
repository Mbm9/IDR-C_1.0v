/**
 * API Route Handler Wrapper
 *
 * Provides consistent error handling, logging, and response formatting
 * for all API routes. Wraps route handlers with try/catch, structured
 * logging, and standardized error responses.
 *
 * Usage:
 *   import { withApiHandler } from '@/lib/api/handler'
 *
 *   export const GET = withApiHandler(async (req, { session, orgId, log }) => {
 *     const data = await db.select().from(identities).where(eq(identities.orgId, orgId))
 *     return NextResponse.json({ data })
 *   })
 *
 *   // With role requirement:
 *   export const POST = withApiHandler(async (req, { session, orgId, log }) => {
 *     // ... mutation logic
 *   }, { requiredRole: 'iam_admin' })
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { logger } from '@/lib/logger'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'

interface HandlerContext {
  /** Authenticated session */
  session: {
    user: {
      id: string
      email: string
      name?: string | null
      orgId: string
      appRole: AppRole
    }
  }
  /** Convenience: org ID from session */
  orgId: string
  /** Request-scoped logger with user/request context */
  log: ReturnType<typeof logger.child>
  /** Dynamic route params (e.g. [fsid]) forwarded from Next.js */
  params?: Record<string, string>
}

interface HandlerOptions {
  /** Minimum role required to access this endpoint */
  requiredRole?: AppRole
  /** Allow unauthenticated access (e.g., health endpoints) */
  public?: boolean
}

type ApiHandler = (
  req: NextRequest,
  ctx: HandlerContext,
) => Promise<NextResponse | Response>

/**
 * Wrap an API route handler with consistent auth, error handling, and logging.
 */
export function withApiHandler(handler: ApiHandler, options: HandlerOptions = {}) {
  return async (req: NextRequest, routeCtx?: any): Promise<NextResponse | Response> => {
    const requestId = crypto.randomUUID().slice(0, 8)
    const method = req.method
    const path = req.nextUrl.pathname
    const start = Date.now()

    const log = logger.child({ requestId, method, path })

    try {
      // Auth check
      if (!options.public) {
        const session = await auth()
        if (!session?.user?.orgId) {
          log.warn('Unauthorized request')
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // RBAC check
        if (options.requiredRole) {
          const userRole = (session.user as any).appRole as AppRole
          if (!hasRole(userRole, options.requiredRole)) {
            log.warn('Forbidden: insufficient role', {
              userRole,
              requiredRole: options.requiredRole,
            })
            return NextResponse.json(
              { error: `Forbidden: ${options.requiredRole} role required` },
              { status: 403 }
            )
          }
        }

        const ctx: HandlerContext = {
          session: session as HandlerContext['session'],
          orgId: session.user.orgId!,
          log,
          params: routeCtx?.params,
        }

        const response = await handler(req, ctx)
        const duration = Date.now() - start
        log.info('Request completed', { status: (response as any).status, durationMs: duration })
        return response
      }

      // Public endpoint — no auth context
      const ctx: HandlerContext = {
        session: null as any,
        orgId: '',
        log,
      }
      const response = await handler(req, ctx)
      const duration = Date.now() - start
      log.info('Request completed', { status: (response as any).status, durationMs: duration })
      return response
    } catch (error: any) {
      const duration = Date.now() - start
      log.error('Unhandled error in API route', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join(' | '),
        durationMs: duration,
      })

      return NextResponse.json(
        {
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : undefined,
          requestId,
        },
        { status: 500 }
      )
    }
  }
}

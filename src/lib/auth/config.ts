import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { users, activeSessions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import type { AppRole } from '@/lib/utils/rbac'
import { logLoginAttempt } from '@/lib/auth/login-logger'
import { clientIp } from '@/lib/middleware/rate-limit'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      orgId?: string | null
      appRole: AppRole
    }
  }

  interface User {
    orgId?: string | null
    appRole?: AppRole
  }
}

declare module 'next-auth' {
  interface JWT {
    orgId?: string | null
    appRole?: AppRole
    /** active_sessions.jti for this sign-in */
    sid?: string
  }
}

const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

/** Client IP and user agent of the current request, when in a request scope. */
async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const { headers } = await import('next/headers')
    const h = headers()
    return { ip: clientIp(h as unknown as Headers), userAgent: h.get('user-agent') ?? undefined }
  } catch {
    return {}
  }
}

/** Insert an active_sessions row for a new sign-in and return its JTI. */
async function createSessionRecord(userId: string): Promise<string> {
  const jti = crypto.randomUUID()
  const { ip, userAgent } = await requestMeta()
  await db.insert(activeSessions).values({ userId, jti, ipAddress: ip ?? null, userAgent: userAgent ?? null })
  return jti
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email as string))
          .limit(1)

        const email = credentials.email as string
        const meta = await requestMeta()

        if (!user || !user.hashedPassword) {
          await logLoginAttempt({ userId: null, email, success: false, ...meta })
          return null
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.hashedPassword
        )
        await logLoginAttempt({ userId: user.id, orgId: user.orgId, email, success: isValid, ...meta })
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.orgId,
          appRole: user.appRole as AppRole,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.orgId = (user as any).orgId
        token.appRole = (user as any).appRole
      }

      // Middleware runs on the Edge runtime, where the Postgres client is not
      // available. Route handlers and server components (Node runtime) do the
      // authoritative checks below on every session read.
      if (process.env.NEXT_RUNTIME === 'edge' || !token.sub) return token

      try {
        // New sign-in: record a session row so it can be listed and revoked.
        if (user) {
          token.sid = await createSessionRecord(token.sub)
        }

        // Role and org are re-read from the database so a demotion, org move or
        // account deletion takes effect on the next request, not at JWT expiry.
        const [freshUser] = await db
          .select({ orgId: users.orgId, appRole: users.appRole })
          .from(users)
          .where(eq(users.id, token.sub))
          .limit(1)
        if (!freshUser) return null
        token.orgId = freshUser.orgId
        token.appRole = freshUser.appRole

        if (typeof token.sid === 'string') {
          const [record] = await db
            .select({ revokedAt: activeSessions.revokedAt, lastActiveAt: activeSessions.lastActiveAt })
            .from(activeSessions)
            .where(eq(activeSessions.jti, token.sid))
            .limit(1)
          // Missing row = deleted by an admin; revokedAt = revoked from settings.
          if (!record || record.revokedAt) return null
          if (Date.now() - record.lastActiveAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
            await db.update(activeSessions)
              .set({ lastActiveAt: new Date() })
              .where(eq(activeSessions.jti, token.sid))
          }
        }
      } catch (err) {
        // A transient DB failure must not sign everyone out; keep the token.
        console.error('[auth] session refresh failed:', (err as Error).message)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.orgId = token.orgId as string | null
        session.user.appRole = (token.appRole as AppRole) ?? 'viewer'
      }
      return session
    },
  },
})

import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

/**
 * Login fixtures aligned with db/seed/index.ts.
 *
 * - admin: admin@acmefs.sa with SEED_ADMIN_PASSWORD (seed default: admin123)
 * - other roles: uat.<role>@acmefs.sa with E2E_USER_PASSWORD; create them with
 *   tests/uat/create-role-users.sql. Specs that need them skip when unset.
 *
 * Sessions are cached per role under tests/.artifacts/.auth so the suite signs in
 * once per role: credential POSTs are rate limited to 30/min per IP, which a
 * suite that logs in before every test exceeds.
 */
export type Role = 'viewer' | 'analyst' | 'iam_admin' | 'ciso' | 'admin'

const AUTH_DIR = path.join('tests', '.artifacts', '.auth')

export function credentials(role: Role): { email: string; password: string } | null {
  if (role === 'admin') {
    return {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@acmefs.sa',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
    }
  }
  const password = process.env.E2E_USER_PASSWORD
  return password ? { email: `uat.${role}@acmefs.sa`, password } : null
}

export const hasRoleUsers = () => !!process.env.E2E_USER_PASSWORD

async function formLogin(page: Page, role: Role) {
  const creds = credentials(role)
  if (!creds) throw new Error(`No credentials for role ${role}; set E2E_USER_PASSWORD`)
  await page.goto('/login')
  await page.fill('input[type="email"]', creds.email)
  await page.fill('input[type="password"]', creds.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
}

/**
 * Sign in as `role`. Reuses the cached session for that role when it is still
 * valid; pass `{ fresh: true }` when the test needs its own session (for
 * example to revoke it).
 */
export async function login(page: Page, role: Role = 'admin', opts: { fresh?: boolean } = {}) {
  const file = path.join(AUTH_DIR, `${role}.json`)
  if (!opts.fresh && fs.existsSync(file)) {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'))
    await page.context().addCookies(state.cookies)
    // Ask the server: a revoked session still passes the edge middleware.
    const session = await page.request.get('/api/auth/session').then((r) => r.json()).catch(() => null)
    if (session?.user) {
      await page.goto('/dashboard')
      return
    }
    await page.context().clearCookies() // cached session expired or was revoked
  }
  await formLogin(page, role)
  if (!opts.fresh) {
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(await page.context().storageState()))
    fs.renameSync(tmp, file)
  }
}

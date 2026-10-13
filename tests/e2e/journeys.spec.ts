import { test, expect, type Browser } from '@playwright/test'
import { login, hasRoleUsers } from './fixtures'

/**
 * Persona journeys from the UAT plan (docs/uat/uat-plan.md, section B2) that
 * can run unattended against a seeded database. Journeys that need a person
 * (AI plan approval wording, Arabic terminology sign-off) are in the manual
 * checklist in docs/uat/uat-run-2026-10-13.md.
 */

async function newSession(browser: Browser, role: Parameters<typeof login>[1], fresh = false) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await login(page, role, { fresh })
  return { ctx, page }
}

test.describe('Analyst journey', () => {
  test.skip(!hasRoleUsers(), 'set E2E_USER_PASSWORD and create the uat.<role> users')

  test('acknowledging a violation writes an audit entry with the actor name', async ({ page }) => {
    await login(page, 'analyst')
    const list = await page.request.get('/api/violations?status=open&pageSize=1')
    expect(list.ok()).toBeTruthy()
    const violation = (await list.json()).data?.[0]
    test.skip(!violation, 'no open violations in the seed')

    const ack = await page.request.post('/api/actions/acknowledge', {
      data: { violationId: violation.id, rationale: 'UAT journey: analyst acknowledgement' },
    })
    expect(ack.status()).toBeLessThan(300)

    const audit = await page.request.get('/api/audit?actionType=acknowledge_violation')
    const entry = (await audit.json()).data?.find((e: any) => e.rationale === 'UAT journey: analyst acknowledgement')
    expect(entry, 'audit entry for the acknowledgement').toBeTruthy()
    expect(entry.actorName, 'audit entry names the analyst').toBeTruthy()
  })

  test('body-less actions are not rejected with 415', async ({ page }) => {
    await login(page, 'analyst')
    // fetch() with no body sends no Content-Type, exactly like the UI buttons.
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      return r.status
    })
    expect(status).not.toBe(415)
    expect(status).toBeLessThan(300)
  })
})

test.describe('Administrator journey', () => {
  test.skip(!hasRoleUsers(), 'set E2E_USER_PASSWORD and create the uat.<role> users')

  test('a role change takes effect on the next request without re-login', async ({ browser }) => {
    // Uses its own invited user so it never changes the shared uat.<role>
    // accounts other specs rely on while running in parallel.
    const admin = await newSession(browser, 'admin')
    const email = `e2e.rolechange.${Date.now()}@acmefs.sa`
    const password = 'E2eRoleChange#2026'
    const userCtx = await browser.newContext()
    try {
      const invite = await admin.page.request.post('/api/settings/team', { data: { email, role: 'viewer' } })
      expect(invite.status(), await invite.text()).toBe(200)
      const token = new URL((await invite.json()).inviteUrl).searchParams.get('invite')
      const signup = await userCtx.request.post('/api/auth/signup', { data: { name: 'E2E Role Change', email, password, inviteToken: token } })
      expect(signup.status(), await signup.text()).toBe(201)
      const userId = (await signup.json()).userId

      const user = await userCtx.newPage()
      await user.goto('/login')
      await user.fill('input[type="email"]', email)
      await user.fill('input[type="password"]', password)
      await user.click('button[type="submit"]')
      await user.waitForURL(/\/dashboard/, { timeout: 15_000 })

      const probe = () => user.request.post('/api/actions/acknowledge', {
        data: { violationId: '00000000-0000-4000-8000-000000000000' },
        failOnStatusCode: false,
      })
      expect((await probe()).status()).toBe(403)

      const promote = await admin.page.request.put('/api/settings/team', { data: { userId, role: 'analyst' } })
      expect(promote.ok(), await promote.text()).toBeTruthy()
      // Same session cookie: the gate now passes and validation answers instead.
      expect((await probe()).status()).not.toBe(403)

      const audit = await (await admin.page.request.get('/api/audit?actionType=change_role')).json()
      expect(audit.data.some((e: any) => e.payload?.userId === userId && e.payload?.to === 'analyst')).toBeTruthy()
    } finally {
      await userCtx.close()
      await admin.ctx.close()
    }
  })

  test('revoking a session signs that session out', async ({ browser }) => {
    const startedAt = new Date(Date.now() - 1000).toISOString()
    const first = await newSession(browser, 'iam_admin', true)
    const second = await newSession(browser, 'iam_admin', true)
    try {
      // Only touch the two sessions this test created; the newest is `second`.
      const sessions = (await (await second.page.request.get('/api/settings/sessions')).json()).sessions
        .filter((s: any) => s.createdAt >= startedAt)
      expect(sessions.length).toBeGreaterThanOrEqual(2)
      const newest = sessions.reduce((a: any, b: any) => (a.createdAt > b.createdAt ? a : b))
      for (const s of sessions.filter((x: any) => x.id !== newest.id)) {
        const del = await second.page.request.delete(`/api/settings/sessions/${s.id}`)
        expect(del.ok()).toBeTruthy()
      }
      const after = await first.page.request.get('/api/identities?pageSize=1', { failOnStatusCode: false })
      expect(after.status()).toBe(401)
    } finally {
      await first.ctx.close()
      await second.ctx.close()
    }
  })
})

test.describe('Scheduler', () => {
  test('cron endpoints require the bearer secret and are reachable with it', async ({ request }) => {
    const anon = await request.get('/api/cron/sync-health', { failOnStatusCode: false })
    expect(anon.status()).toBe(401)

    test.skip(!process.env.CRON_SECRET, 'set CRON_SECRET to test the authorised call')
    const ok = await request.get('/api/cron/sync-health', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    expect(ok.status()).toBe(200)
  })
})

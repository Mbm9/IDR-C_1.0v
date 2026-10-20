import { test, expect, request as playwrightRequest } from '@playwright/test'
import { login } from './fixtures'

/**
 * UAT-115 / UAT-116 end-to-end checks.
 *
 * Note: the invitation journey creates a real user (unique email per run) in
 * the target database; there is no API to delete users.
 */

test.describe('API keys (UAT-116)', () => {
  test('an admin-created key can push events; a revoked key gets 401', async ({ page, baseURL }) => {
    await login(page, 'admin')

    const created = await page.request.post('/api/settings/api-keys', { data: { label: `e2e ${Date.now()}` } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const { key, prefix } = await created.json()
    expect(key).toMatch(/^idr_[0-9a-f]{64}$/)

    // A cookie-less client, as a SIEM would be.
    const machine = await playwrightRequest.newContext({ baseURL })
    const events = { events: [{ eventType: 'login_success', source: 'e2e', eventTimestamp: new Date().toISOString() }] }
    const ok = await machine.post('/api/events/ingest', { headers: { Authorization: `Bearer ${key}` }, data: events })
    expect(ok.status()).toBe(200)
    expect((await ok.json()).inserted).toBe(1)

    // Keys only work on allow-listed machine endpoints.
    const other = await machine.get('/api/identities', { headers: { Authorization: `Bearer ${key}` } })
    expect(other.status()).toBe(401)

    const keys = (await (await page.request.get('/api/settings/api-keys')).json()).keys as any[]
    const keyId = keys.find((k) => k.keyPrefix === prefix)?.id
    expect(keyId).toBeTruthy()
    expect((await page.request.delete('/api/settings/api-keys', { data: { keyId } })).ok()).toBeTruthy()

    const revoked = await machine.post('/api/events/ingest', { headers: { Authorization: `Bearer ${key}` }, data: events })
    expect(revoked.status()).toBe(401)
    await machine.dispose()
  })
})

test.describe('Invitations (UAT-115)', () => {
  test('an invited user joins the inviting org with the invited role and lands on the dashboard', async ({ page, browser }) => {
    await login(page, 'admin')
    const email = `e2e.invitee.${Date.now()}@acmefs.sa`
    const invite = await page.request.post('/api/settings/team', { data: { email, role: 'analyst' } })
    expect(invite.ok(), await invite.text()).toBeTruthy()
    const { inviteUrl } = await invite.json()
    expect(inviteUrl).toContain('/signup?invite=')

    const context = await browser.newContext()
    const invitee = await context.newPage()
    // Joining needs the link's token; the bare email is not enough.
    await invitee.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).search)
    // The page names the inviting org and fills in the invited address, locked.
    await expect(invitee.getByRole('heading', { name: /Join / })).toBeVisible()
    await expect(invitee.locator('#email')).toHaveValue(email)
    await expect(invitee.locator('#email')).toHaveAttribute('readonly', '')
    await invitee.fill('#name', 'E2E Invitee')
    await invitee.fill('#password', 'E2eInvitee#2026')
    await invitee.click('button[type="submit"]')

    await expect(invitee.getByTestId('signup-joined-org')).toBeVisible()
    await invitee.waitForURL(/\/dashboard/, { timeout: 15_000 })

    const session = await (await invitee.request.get('/api/auth/session')).json()
    expect(session.user.appRole).toBe('analyst')
    const adminSession = await (await page.request.get('/api/auth/session')).json()
    expect(session.user.orgId).toBe(adminSession.user.orgId)
    await context.close()
  })

  test('a used or unknown invite link shows the invalid-link screen', async ({ page, browser }) => {
    await login(page, 'admin')
    const email = `e2e.used.${Date.now()}@acmefs.sa`
    const { inviteUrl } = await (await page.request.post('/api/settings/team', { data: { email, role: 'viewer' } })).json()
    const token = new URL(inviteUrl).searchParams.get('invite')!

    // The lookup reveals the invite only to the link holder, and only while it is pending.
    const ok = await page.request.get(`/api/auth/invite?token=${encodeURIComponent(token)}`)
    expect(await ok.json()).toMatchObject({ email, role: 'viewer' })
    const unknown = await page.request.get('/api/auth/invite?token=' + 'A'.repeat(43), { failOnStatusCode: false })
    expect(unknown.status()).toBe(404)

    const context = await browser.newContext()
    const invitee = await context.newPage()
    const signup = await invitee.request.post('/api/auth/signup', { data: { email, password: 'E2eInvitee#2026', inviteToken: token } })
    expect(signup.ok(), await signup.text()).toBeTruthy()
    const used = await page.request.get(`/api/auth/invite?token=${encodeURIComponent(token)}`, { failOnStatusCode: false })
    expect(used.status()).toBe(404)

    await invitee.goto(`/signup?invite=${encodeURIComponent(token)}`)
    // (Next.js also renders an empty role=alert route announcer.)
    await expect(invitee.getByRole('alert').filter({ hasText: /no longer valid/i })).toBeVisible()
    await context.close()
  })

  test('an admin can revoke a pending invitation', async ({ page }) => {
    await login(page, 'admin')
    const email = `e2e.revoke.${Date.now()}@acmefs.sa`
    const { invitation } = await (await page.request.post('/api/settings/team', { data: { email, role: 'viewer' } })).json()

    const res = await page.request.delete('/api/settings/team', { data: { invitationId: invitation.id } })
    expect(res.ok()).toBeTruthy()
    const team = await (await page.request.get('/api/settings/team')).json()
    expect(team.invitations.some((i: any) => i.id === invitation.id)).toBe(false)
  })
})

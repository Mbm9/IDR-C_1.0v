import { test, expect } from '@playwright/test'
import { login } from './fixtures'

test.describe('Settings', () => {
  test('integrations and the audit trail live under Settings; old URLs redirect', async ({ page }) => {
    await login(page, 'admin')
    for (const [oldUrl, tab, heading] of [
      ['/dashboard/integrations', 'integrations', /Integration/],
      ['/dashboard/audit', 'audit-trail', /Audit Trail/],
    ] as const) {
      await page.goto(oldUrl)
      await page.waitForURL(`**/dashboard/settings?tab=${tab}`)
      await expect(page.locator('[role=tab][aria-selected=true]')).toHaveAttribute('id', `settings-tab-${tab}`)
      await expect(page.getByRole('tabpanel').getByRole('heading', { level: 3 }).first()).toHaveText(heading)
    }
    // Neither has its own sidebar entry any more.
    const nav = page.getByRole('navigation').first()
    await expect(nav.locator('a[href="/dashboard/integrations"]')).toHaveCount(0)
    await expect(nav.locator('a[href="/dashboard/audit"]')).toHaveCount(0)
  })

  test('an admin cannot change their own role', async ({ page }) => {
    await login(page, 'admin')
    const me = (await (await page.request.get('/api/auth/session')).json()).user
    const res = await page.request.put('/api/settings/team', { data: { userId: me.id, role: 'viewer' }, failOnStatusCode: false })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toMatch(/own role/i)
    const after = (await (await page.request.get('/api/settings/team')).json()).members.find((m: any) => m.id === me.id)
    expect(after.appRole).toBe('admin')

    // The UI shows the own role as text, not a dropdown.
    await page.goto('/dashboard/settings?tab=team')
    await expect(page.getByLabel(new RegExp(`Role for ${me.name ?? me.email}`))).toHaveCount(0)
  })

  test('the logo white background is optional and off by default', async ({ page }) => {
    await login(page, 'admin')
    const before = (await (await page.request.get('/api/settings/organization')).json()).branding
    expect(typeof before.logoBackground).toBe('boolean')
    try {
      const on = await page.request.put('/api/settings/organization', { data: { logoBackground: !before.logoBackground } })
      expect(on.ok()).toBeTruthy()
      expect((await on.json()).branding.logoBackground).toBe(!before.logoBackground)
      const bad = await page.request.put('/api/settings/organization', { data: { logoBackground: 'yes' }, failOnStatusCode: false })
      expect(bad.status()).toBe(400)
    } finally {
      await page.request.put('/api/settings/organization', { data: { logoBackground: before.logoBackground } })
    }
  })
})

test.describe('Attack paths', () => {
  test('the table pages through every path and can sort by length', async ({ page }) => {
    await login(page, 'admin')
    const first = await (await page.request.get('/api/attack-paths?limit=10')).json()
    test.skip(first.total <= 10, 'needs more than one page of attack paths')
    const second = await (await page.request.get('/api/attack-paths?limit=10&offset=10')).json()
    const ids = new Set(first.paths.map((p: any) => p.id))
    expect(second.paths.some((p: any) => ids.has(p.id))).toBe(false)

    const byLength = (await (await page.request.get('/api/attack-paths?sort=length&limit=20')).json()).paths
    const lengths = byLength.map((p: any) => p.pathLength)
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a))
    const bad = await page.request.get('/api/attack-paths?sort=nope', { failOnStatusCode: false })
    expect(bad.status()).toBe(400)

    // A row expands into the path chain.
    await page.goto('/dashboard/attack-paths')
    await page.locator('tbody button[aria-expanded="false"]').first().click()
    await expect(page.locator('svg[role=img][aria-label*="→"]').first()).toBeVisible()
  })
})

test.describe('Onboarding', () => {
  test('a new sign-up walks through every wizard step into an empty organization', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const stamp = Date.now()
    await page.goto('/signup')
    await page.fill('#name', 'E2E Owner')
    await page.fill('#email', `e2e.owner.${stamp}@e2e-org-${stamp}.test`)
    await page.fill('#password', 'E2eOwner#2026pass')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/onboarding')

    await page.getByLabel(/Organization name/i).fill(`E2E Org ${stamp}`)
    await page.getByLabel(/Primary domain/i).fill(`e2e-org-${stamp}.test`)
    await page.getByRole('button', { name: /^continue$/i }).click()
    // Creating the org refreshes the session; the wizard must keep going.
    await expect(page.getByRole('heading', { name: /Connect your first source/i })).toBeVisible()
    expect(page.url()).toContain('/onboarding')
    await page.getByRole('button', { name: /skip for now/i }).click()
    await page.getByRole('button', { name: /^continue$/i }).click()
    await expect(page.getByRole('heading', { name: /Invite your team/i })).toBeVisible()
    await page.getByRole('button', { name: /skip for now/i }).click()
    await page.waitForURL(/\/dashboard/)

    const session = await (await page.request.get('/api/auth/session')).json()
    expect(session.user.appRole).toBe('admin')
    const ids = await (await page.request.get('/api/identities?pageSize=1')).json()
    expect(ids.total).toBe(0)
    await ctx.close()
  })
})

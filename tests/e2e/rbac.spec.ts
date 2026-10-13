import { test, expect } from '@playwright/test'
import { login, hasRoleUsers, type Role } from './fixtures'

/**
 * RBAC negative cases: a role below the requirement must get 401/403 from the
 * API, whatever the UI shows. Requires the uat.<role> users
 * (tests/uat/create-role-users.sql) and E2E_USER_PASSWORD.
 *
 * Bodies are empty or reference a random UUID, so a broken gate fails with a
 * 400/404 rather than changing data.
 */
const RANDOM_ID = '00000000-0000-4000-8000-000000000000'

const CASES: Array<{ method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; data?: unknown; deniedFor: Role[] }> = [
  { method: 'POST', path: '/api/actions/acknowledge', data: { violationId: RANDOM_ID }, deniedFor: ['viewer'] },
  { method: 'POST', path: '/api/actions/certify', data: {}, deniedFor: ['viewer', 'analyst'] },
  { method: 'POST', path: '/api/actions/revoke', data: {}, deniedFor: ['viewer', 'analyst'] },
  { method: 'POST', path: '/api/actions/update-tier', data: {}, deniedFor: ['viewer', 'analyst'] },
  { method: 'POST', path: '/api/actions/approve-exception', data: {}, deniedFor: ['viewer', 'analyst', 'iam_admin'] },
  { method: 'POST', path: '/api/integrations', data: {}, deniedFor: ['viewer', 'analyst'] },
  { method: 'PUT', path: '/api/settings/team', data: {}, deniedFor: ['viewer', 'analyst', 'iam_admin', 'ciso'] },
  { method: 'POST', path: '/api/settings/api-keys', data: {}, deniedFor: ['viewer', 'analyst', 'iam_admin', 'ciso'] },
  { method: 'POST', path: '/api/notifications', data: {}, deniedFor: ['viewer', 'analyst', 'iam_admin', 'ciso'] },
  { method: 'POST', path: '/api/onboarding', data: { step: 'integration', data: {} }, deniedFor: ['viewer', 'analyst'] },
  { method: 'POST', path: '/api/onboarding', data: { step: 'team', data: {} }, deniedFor: ['viewer', 'analyst', 'iam_admin', 'ciso'] },
  // Re-running these scanners replaces stored findings; the request is never
  // sent for roles that are allowed, only for the denied ones.
  { method: 'POST', path: '/api/shadow-admins', deniedFor: ['viewer'] },
  { method: 'POST', path: '/api/peer-groups', deniedFor: ['viewer'] },
]

test.describe('RBAC: API denies roles below the requirement', () => {
  test.skip(!hasRoleUsers(), 'set E2E_USER_PASSWORD and create the uat.<role> users')

  for (const role of ['viewer', 'analyst', 'iam_admin', 'ciso'] as Role[]) {
    test(`${role} is denied mutations above its role`, async ({ page }) => {
      await login(page, role)
      for (const c of CASES.filter((x) => x.deniedFor.includes(role))) {
        const res = await page.request.fetch(c.path, {
          method: c.method,
          data: c.data ?? {},
          failOnStatusCode: false,
        })
        expect.soft([401, 403], `${role} ${c.method} ${c.path} -> ${res.status()}`).toContain(res.status())
      }
    })
  }

  test('onboarding cannot create a second organization', async ({ page }) => {
    await login(page, 'viewer')
    const res = await page.request.post('/api/onboarding', {
      data: { step: 'organization', data: { name: 'Shadow Org', domain: 'shadow.example' } },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(409)
  })
})

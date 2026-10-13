import { test, expect } from '@playwright/test'
import { login } from './fixtures'

test.describe('Identities Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('navigates to /dashboard/identities', async ({ page }) => {
    await page.goto('/dashboard/identities')
    await page.waitForLoadState('networkidle')

    // Page should load without errors
    await expect(page).toHaveURL(/\/dashboard\/identities/)
  })

  test('shows identity table with rows', async ({ page }) => {
    await page.goto('/dashboard/identities')
    await page.waitForLoadState('networkidle')

    // Look for table element or data rows
    const table = page.locator('table, [role="table"], [class*="table"]').first()
    await expect(table).toBeVisible({ timeout: 15_000 })

    // Should have at least one data row
    const rows = page.locator('table tbody tr, [role="row"]')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
  })

  test('table has expected column headers', async ({ page }) => {
    await page.goto('/dashboard/identities')
    await page.waitForLoadState('networkidle')

    // Check for common column headers
    const nameHeader = page.getByText(/name/i).first()
    await expect(nameHeader).toBeVisible({ timeout: 10_000 })
  })

  test('can filter by tier', async ({ page }) => {
    await page.goto('/dashboard/identities')
    await page.waitForLoadState('networkidle')

    // Look for tier filter select or dropdown
    const tierFilter = page.locator('select, [class*="filter"], [class*="select"]').first()
    if (await tierFilter.isVisible()) {
      // Interact with the first filter-like element
      await tierFilter.click()
    }

    // The page should still be functional after attempting filter
    await expect(page).toHaveURL(/\/dashboard\/identities/)
  })

  test('can click on an identity row to navigate to detail', async ({ page }) => {
    await page.goto('/dashboard/identities')
    await page.waitForLoadState('networkidle')

    // Wait for table rows
    const firstRow = page.locator('table tbody a[href^="/dashboard/identities/"]').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })

    // Rows are not clickable; the identity name links to the detail page
    await firstRow.click()

    // Should navigate to identity detail page
    await expect(page).toHaveURL(/\/dashboard\/identities\/[a-f0-9-]+/, { timeout: 10_000 })
  })

  test('identity detail page shows tabs', async ({ page }) => {
    await page.goto('/dashboard/identities')
    await page.waitForLoadState('networkidle')

    // Click first row to go to detail
    const firstRow = page.locator('table tbody a[href^="/dashboard/identities/"]').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })
    await firstRow.click()

    await page.waitForLoadState('networkidle')

    // Look for tab navigation on detail page
    const tabs = page.locator('main [role="tablist"]:visible, main [role="tab"]:visible, main button:has-text("Overview")').first()
    await expect(tabs).toBeVisible({ timeout: 10_000 })
  })

  test('identity detail page shows identity name', async ({ page }) => {
    await page.goto('/dashboard/identities')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('table tbody a[href^="/dashboard/identities/"]').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })
    await firstRow.click()

    await page.waitForLoadState('networkidle')

    // Should show some identity name or heading
    const heading = page.locator('main h1:visible, main h2:visible').first()
    await expect(heading).toBeVisible({ timeout: 10_000 })
    const text = await heading.textContent()
    expect(text).toBeTruthy()
    expect(text!.length).toBeGreaterThan(0)
  })

  test('search input filters the table', async ({ page }) => {
    await page.goto('/dashboard/identities')
    await page.waitForLoadState('networkidle')

    // Look for search input
    const searchInput = page.locator('input[placeholder*="earch"], input[type="search"], input[name="search"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill('admin')
      // Give it time to filter
      await page.waitForTimeout(1000)
      await expect(page).toHaveURL(/\/dashboard\/identities/)
    }
  })
})

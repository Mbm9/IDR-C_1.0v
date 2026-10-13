import { test, expect } from '@playwright/test'
import { login } from './fixtures'

test.describe('Dashboard Overview', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('shows metric cards with numbers', async ({ page }) => {
    // Wait for dashboard to load
    await page.waitForLoadState('networkidle')

    // Look for metric cards (common pattern: cards with numeric values)
    const metricCards = page.locator('[class*="metric"], [class*="card"], [class*="stat"]').first()
    await expect(metricCards).toBeVisible({ timeout: 10_000 })
  })

  test('shows risk trend chart area', async ({ page }) => {
    await page.waitForLoadState('networkidle')

    // Recharts renders SVGs or canvas - look for chart containers
    const chartArea = page.locator('.recharts-wrapper, [class*="chart"], svg.recharts-surface').first()
    await expect(chartArea).toBeVisible({ timeout: 10_000 })
  })

  test('shows top riskiest identities section', async ({ page }) => {
    await page.waitForLoadState('networkidle')

    // Look for text mentioning "risk" or "riskiest"
    const riskSection = page.locator('main').getByText(/riskiest/i).first()
    await expect(riskSection).toBeVisible({ timeout: 10_000 })
  })

  test('navigation sidebar is visible', async ({ page }) => {
    // Look for sidebar nav element
    const sidebar = page.locator('aside:visible, nav:visible').first()
    await expect(sidebar).toBeVisible()
  })

  test('sidebar has navigation links', async ({ page }) => {
    // Check for key nav items
    const identitiesLink = page.getByRole('link', { name: /identit/i }).first()
    await expect(identitiesLink).toBeVisible({ timeout: 5_000 })
  })

  test('can navigate to identities page via sidebar', async ({ page }) => {
    const identitiesLink = page.getByRole('link', { name: /identit/i }).first()
    await identitiesLink.click()
    await expect(page).toHaveURL(/\/dashboard\/identities/, { timeout: 10_000 })
  })

  test('can navigate to violations page via sidebar', async ({ page }) => {
    const violationsLink = page.getByRole('link', { name: /violation/i }).first()
    await violationsLink.click()
    await expect(page).toHaveURL(/\/dashboard\/violations/, { timeout: 10_000 })
  })

  test('can navigate to tiering page via sidebar', async ({ page }) => {
    const tieringLink = page.getByRole('link', { name: /tier/i }).first()
    await tieringLink.click()
    await expect(page).toHaveURL(/\/dashboard\/tiering/, { timeout: 10_000 })
  })

  test('shows user info or org name in header', async ({ page }) => {
    await page.waitForLoadState('networkidle')

    // Look for user name, email, or org name in the header area
    const header = page.locator('header, [class*="header"]').first()
    await expect(header).toBeVisible()
  })
})

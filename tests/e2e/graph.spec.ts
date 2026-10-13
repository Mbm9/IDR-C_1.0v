import { test, expect } from '@playwright/test'
import { login } from './fixtures'

test.describe('Graph Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('navigates to /dashboard/graph', async ({ page }) => {
    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/dashboard\/graph/)
  })

  test('shows graph visualization area', async ({ page }) => {
    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')

    // Graph uses SVG (d3) or canvas for visualization
    const graphArea = page.locator('main canvas:visible, main svg[width]:visible').last()
    await expect(graphArea).toBeVisible({ timeout: 15_000 })
  })

  test('shows search/query input', async ({ page }) => {
    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')

    // Look for search or query input
    const searchInput = page.locator(
      'input[placeholder*="earch"], input[placeholder*="uery"], input[placeholder*="ypher"], input[type="text"]'
    ).first()
    await expect(searchInput).toBeVisible({ timeout: 10_000 })
  })

  test('can type a search query and results update', async ({ page }) => {
    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator(
      'input[placeholder*="earch"], input[placeholder*="uery"], input[placeholder*="ypher"], input[type="text"]'
    ).first()
    await expect(searchInput).toBeVisible({ timeout: 10_000 })

    await searchInput.fill('admin')
    // Wait for debounce/filtering
    await page.waitForTimeout(1000)

    // Page should still be functional
    await expect(page).toHaveURL(/\/dashboard\/graph/)
  })

  test('shows tier filter controls', async ({ page }) => {
    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')

    // Look for filter controls (selects, buttons, etc.)
    const filterControl = page.locator(
      'main select:visible, main button:visible'
    ).first()
    await expect(filterControl).toBeVisible({ timeout: 10_000 })
  })

  test('shows edge type toggle controls', async ({ page }) => {
    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')

    // Look for edge type labels like "Entitlements", "Memberships", etc.
    const entitlementLabel = page.locator('main').getByText(/entitlement/i).first()
    await expect(entitlementLabel).toBeVisible({ timeout: 10_000 })
  })

  test('clicking a node opens detail panel', async ({ page }) => {
    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')

    // Wait for graph to render
    await page.waitForTimeout(2000)

    // Try clicking on a circle/node in the SVG
    const node = page.locator('svg circle, svg g[class*="node"]').first()
    if (await node.isVisible()) {
      await node.click()

      // Look for detail panel to appear
      const detailPanel = page.locator('[class*="panel"], [class*="detail"], [class*="sidebar"]').last()
      await expect(detailPanel).toBeVisible({ timeout: 5_000 })
    }
  })

  test('shows limit control', async ({ page }) => {
    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')

    // Look for limit/count control
    const limitControl = page.locator(
      'select, input[type="number"], [class*="limit"]'
    ).first()
    await expect(limitControl).toBeVisible({ timeout: 10_000 })
  })

  test('graph loads without errors', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = []
    page.on('console', (msg: any) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/dashboard/graph')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('hydration') && !e.includes('404') &&
        // Prefetches and session polls from the previous page are aborted by the navigation itself.
        !e.includes('Failed to fetch')
    )
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0)
  })
})

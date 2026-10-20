import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Local test output stays under tests/.artifacts (git-ignored)
  outputDir: 'tests/.artifacts/results',
  reporter: [['html', { outputFolder: 'tests/.artifacts/report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    // PW_CHROMIUM: use a pre-installed Chromium instead of `playwright install`
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The suite reuses one admin account, so it exceeds the per-user API limit
    // meant for people (300/min). When reusing a running server, start it with
    // the same variable.
    env: { RATE_LIMIT_API_PER_MIN: '5000', RATE_LIMIT_AUTH_PER_MIN: '200' },
  },
})

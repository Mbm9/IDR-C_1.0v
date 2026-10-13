#!/usr/bin/env node
/**
 * UI RBAC check — signs in as the viewer and lists visible, enabled controls
 * whose label is a mutation verb. The API refuses these for a viewer (see
 * rbac-probe.mjs), so each one is a control that will fail with 403 when used.
 *
 * Usage: UAT_PASSWORD=... node tests/uat/ui-rbac.mjs
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const OUT = path.join(process.env.UAT_OUT || 'docs/uat', 'data')
const ids = JSON.parse(process.env.UAT_DETAIL_IDS || '{}')
const ROUTES = [
  '/dashboard/identities', '/dashboard/tiering', '/dashboard/entitlements', '/dashboard/exposures',
  '/dashboard/attack-paths', '/dashboard/violations', '/dashboard/issues', '/dashboard/import',
  '/dashboard/integrations', '/dashboard/settings', '/dashboard/ai', '/dashboard/canaries',
  '/dashboard/certifications', '/dashboard/data-quality', '/dashboard/gpo', '/dashboard/nhi',
  '/dashboard/peer-analysis', '/dashboard/remediation', '/dashboard/shadow-admins', '/dashboard/threats',
  ids.identity && `/dashboard/identities/${ids.identity}`,
  ids.attackPath && `/dashboard/attack-paths/${ids.attackPath}`,
  ids.threat && `/dashboard/threats/${ids.threat}`,
].filter(Boolean)

const VERBS = /^(\+\s*)?(run|scan|acknowledge|ack|revoke|certify|approve|reject|escalate|update tier|trigger|disable|delete|remove|create|add|connect|import|upload|sync|invite|generate|save|resolve|mark|dismiss|accept|apply|enable|retry|triage|narrate|load demo|skip|new)\b/i

async function main() {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto('/login')
  await page.fill('input[type="email"]', 'uat.viewer@acmefs.sa')
  await page.fill('input[type="password"]', process.env.UAT_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/)

  const results = []
  for (const route of ROUTES) {
    await page.goto(route)
    await page.waitForLoadState('networkidle').catch(() => {})
    const controls = await page.evaluate((src) => {
      const re = new RegExp(src, 'i')
      return Array.from(document.querySelectorAll('main button, main a[role="button"]'))
        .filter((el) => el.offsetParent !== null && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .map((el) => (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))
        .filter((t) => t && t.length < 50 && re.test(t))
    }, VERBS.source)
    results.push({ route: route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, ':id'), controls: [...new Set(controls)] })
    console.log(`${route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, ':id').padEnd(34)} ${[...new Set(controls)].join(' | ')}`)
  }
  await browser.close()
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'ui-rbac-viewer.json'), JSON.stringify(results, null, 1))
}

main().catch((e) => { console.error(e); process.exit(1) })

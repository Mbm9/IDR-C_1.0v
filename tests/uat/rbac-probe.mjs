#!/usr/bin/env node
/**
 * RBAC probe — calls every mutation endpoint as each role with an empty JSON
 * body and records the status. 401/403 means the role gate fired; anything
 * else (400/404/200/500) means the request got past authorization.
 *
 * Path parameters are replaced with a random UUID, so handlers that pass the
 * gate usually stop at validation or "not found" without changing data.
 * Routes whose handler mutates on an empty body are skipped (see SKIP).
 *
 * Usage: SEED_ADMIN_PASSWORD=... UAT_PASSWORD=... node tests/uat/rbac-probe.mjs
 */
import { chromium, request } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const OUT = path.join(process.env.UAT_OUT || 'tests/uat/reports', 'data')
fs.mkdirSync(OUT, { recursive: true })

const USERS = {
  viewer: { email: 'uat.viewer@acmefs.sa', password: process.env.UAT_PASSWORD },
  analyst: { email: 'uat.analyst@acmefs.sa', password: process.env.UAT_PASSWORD },
  iam_admin: { email: 'uat.iam_admin@acmefs.sa', password: process.env.UAT_PASSWORD },
  ciso: { email: 'uat.ciso@acmefs.sa', password: process.env.UAT_PASSWORD },
  admin: { email: 'admin@acmefs.sa', password: process.env.SEED_ADMIN_PASSWORD || 'admin123' },
}

// Endpoints that rewrite data even with an empty body, or are not role-gated by design.
const SKIP = {
  'POST /api/auth/signup': 'public by design',
  'POST /api/shadow-admins': 'empty body re-runs the scan and replaces open findings (no role check, confirmed in code)',
  'POST /api/peer-groups': 'empty body deletes all peer groups and anomalies (no role check, confirmed in code)',
  'POST /api/import/demo': 'loads demo data',
  'POST /api/attack-paths': 'empty body re-runs the scan',
  'POST /api/gpo/scan': 'empty body re-runs the scan',
  'POST /api/notifications/mark-all-read': 'per-user action, any role by design',
}

// Minimum role expected for each mutation, from the RBAC table in CLAUDE.md and the route code.
const EXPECTED = {
  'POST /api/actions/acknowledge': 'analyst', 'POST /api/actions/trigger-review': 'analyst',
  'POST /api/actions/certify': 'iam_admin', 'POST /api/actions/revoke': 'iam_admin',
  'POST /api/actions/update-tier': 'iam_admin', 'POST /api/actions/escalate': 'analyst',
  'POST /api/actions/approve-exception': 'ciso', 'PUT /api/ai/plans': 'ciso',
  'POST /api/integrations': 'iam_admin', 'POST /api/integrations/test': 'iam_admin',
  'POST /api/sync/[source]': 'iam_admin', 'POST /api/import/csv': 'iam_admin',
  'POST /api/settings/team': 'admin', 'PUT /api/settings/team': 'admin',
  'POST /api/settings/api-keys': 'admin', 'DELETE /api/settings/api-keys': 'admin',
  'POST /api/notifications': 'admin',
}

function routesWithMethods() {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'route.ts') {
        const src = fs.readFileSync(p, 'utf8')
        const methods = [...src.matchAll(/export (?:const|async function) (POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1])
        const route = '/' + path.relative('app', path.dirname(p)).split(path.sep).join('/')
        for (const m of new Set(methods)) out.push({ method: m, route })
      }
    }
  }
  walk('src/app/api')
  return out.filter((r) => !r.route.startsWith('/api/cron/') && !r.route.startsWith('/api/auth/[') && r.route !== '/api/onboarding')
}

async function sessionFor(browser, role) {
  const ctx = await browser.newContext({ baseURL: BASE_URL })
  const page = await ctx.newPage()
  await page.goto('/login')
  await page.fill('input[type="email"]', USERS[role].email)
  await page.fill('input[type="password"]', USERS[role].password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
  const state = await ctx.storageState()
  await ctx.close()
  return request.newContext({ baseURL: BASE_URL, storageState: state })
}

async function main() {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const endpoints = routesWithMethods()
  const results = []
  for (const role of Object.keys(USERS)) {
    const api = await sessionFor(browser, role)
    for (const { method, route } of endpoints) {
      const key = `${method} ${route}`
      if (SKIP[key]) { results.push({ role, key, skipped: SKIP[key] }); continue }
      const url = route.replace(/\[[^\]]+\]/g, () => crypto.randomUUID())
      const res = await api.fetch(url, { method, data: {}, headers: { 'content-type': 'application/json' }, failOnStatusCode: false })
      results.push({ role, key, status: res.status(), gated: res.status() === 401 || res.status() === 403, expectedMinRole: EXPECTED[key] })
    }
    await api.dispose()
  }
  await browser.close()
  fs.writeFileSync(path.join(OUT, 'rbac-probe.json'), JSON.stringify(results, null, 1))

  // Matrix to stdout: one row per endpoint, one column per role
  const roles = Object.keys(USERS)
  const keys = [...new Set(results.map((r) => r.key))]
  console.log(['endpoint', ...roles].join('\t'))
  for (const k of keys) {
    console.log([k, ...roles.map((r) => {
      const x = results.find((y) => y.role === r && y.key === k)
      return x.skipped ? 'skip' : (x.gated ? `${x.status}` : `ok:${x.status}`)
    })].join('\t'))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

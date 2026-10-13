#!/usr/bin/env node
/**
 * UAT crawler — visits every dashboard route per role, locale, theme and width,
 * and records console errors, failed API calls, axe-core violations, horizontal
 * overflow, untranslated UI chrome in Arabic, and load time.
 *
 * Usage (app running on BASE_URL, database seeded, role users created):
 *   UAT_PASSWORD=... SEED_ADMIN_PASSWORD=... node tests/uat/crawl.mjs
 *
 * Env:
 *   BASE_URL            default http://localhost:3000
 *   SEED_ADMIN_PASSWORD password of admin@acmefs.sa
 *   UAT_PASSWORD        password of uat.<role>@acmefs.sa users
 *   UAT_OUT             output dir, default docs/uat
 *   UAT_DETAIL_IDS      JSON {identity, attackPath, gpo, threat} for detail routes
 *   UAT_FULL=1          also crawl every role (default: admin full matrix + viewer EN-light)
 *   PW_CHROMIUM         optional path to a Chromium binary
 *   UAT_ROUTES          comma-separated routes to limit the crawl; a trailing * matches a prefix
 *   UAT_FILE            output file name in the data dir (default crawl-results.json)
 *
 * The crawler issues far more API calls per minute than a person; start the app
 * with RATE_LIMIT_API_PER_MIN raised (e.g. 5000) so 429s do not skew results.
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const OUT = process.env.UAT_OUT || 'docs/uat'
const SCREENS = path.join(OUT, 'screens')
const DATA = path.join(OUT, 'data')
fs.mkdirSync(SCREENS, { recursive: true })
fs.mkdirSync(DATA, { recursive: true })

const ids = JSON.parse(process.env.UAT_DETAIL_IDS || '{}')

const ROUTES = [
  '/dashboard', '/dashboard/identities', '/dashboard/tiering', '/dashboard/entitlements',
  '/dashboard/exposures', '/dashboard/tier0-live', '/dashboard/attack-paths', '/dashboard/blast-radius',
  '/dashboard/graph', '/dashboard/graph-explorer', '/dashboard/issues', '/dashboard/violations',
  '/dashboard/compliance', '/dashboard/import', '/dashboard/integrations', '/dashboard/audit',
  '/dashboard/settings',
  // Not in the sidebar: direct URL only
  '/dashboard/ai', '/dashboard/ai-chat', '/dashboard/canaries', '/dashboard/certifications',
  '/dashboard/data-quality', '/dashboard/docs', '/dashboard/gpo', '/dashboard/nhi',
  '/dashboard/peer-analysis', '/dashboard/remediation', '/dashboard/reports', '/dashboard/results',
  '/dashboard/shadow-admins', '/dashboard/supply-chain', '/dashboard/threats',
  ids.identity && `/dashboard/identities/${ids.identity}`,
  ids.attackPath && `/dashboard/attack-paths/${ids.attackPath}`,
  ids.gpo && `/dashboard/gpo/${ids.gpo}`,
  ids.threat && `/dashboard/threats/${ids.threat}`,
].filter(Boolean).filter((r) => !process.env.UAT_ROUTES || process.env.UAT_ROUTES.split(',').some((x) => (x.endsWith('*') ? r.startsWith(x.slice(0, -1)) : r === x)))

const SIDEBAR = new Set(ROUTES.slice(0, 17))

const USERS = {
  admin: { email: 'admin@acmefs.sa', password: process.env.SEED_ADMIN_PASSWORD || 'admin123' },
  ciso: { email: 'uat.ciso@acmefs.sa', password: process.env.UAT_PASSWORD },
  iam_admin: { email: 'uat.iam_admin@acmefs.sa', password: process.env.UAT_PASSWORD },
  analyst: { email: 'uat.analyst@acmefs.sa', password: process.env.UAT_PASSWORD },
  viewer: { email: 'uat.viewer@acmefs.sa', password: process.env.UAT_PASSWORD },
}

const VARIANTS = [
  { locale: 'en', theme: 'light' },
  { locale: 'en', theme: 'dark' },
  { locale: 'ar', theme: 'light' },
  { locale: 'ar', theme: 'dark' },
]
const WIDTHS = [1440, 1024, 768, 390]

// Brand names, acronyms and standards that legitimately stay Latin in Arabic UI.
const LATIN_ALLOWLIST = /^(Identity Radar|AD|NHI|MFA|SSO|PAM|IGA|ITDR|ISPM|AI|API|CSV|PDF|JSON|LDAP|SAML|OAuth|SCIM|GPO|OU|DN|UPN|SID|NCA|ECC|SAMA|CSF|PDPL|NIST|MITRE|ATT&CK|T\d{4}(\.\d{3})?|Tier ?[0-2]|T[0-2]|Okta|Azure|Entra|SailPoint|ServiceNow|Splunk|CyberArk|BeyondTrust|HashiCorp|Vault|DigiCert|SAP|GRC|Broadcom|SiteMinder|Defender|Microsoft|Active Directory|Ollama|Anthropic|qwen[\w.:-]*|Kerberos|DCSync|ESC\d+|acmefs|ACME|\S+@\S+|https?:\/\/\S+|[A-Z]{2,6}-\d+|v?\d[\d.]*)$/i

async function login(browser, role) {
  const ctx = await browser.newContext({ baseURL: BASE_URL })
  const page = await ctx.newPage()
  await page.goto('/login')
  await page.fill('input[type="email"]', USERS[role].email)
  await page.fill('input[type="password"]', USERS[role].password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
  const state = await ctx.storageState()
  await ctx.close()
  return state
}

async function visit(browser, state, role, route, variant, width, { screenshot, axe }) {
  const ctx = await browser.newContext({
    baseURL: BASE_URL,
    storageState: state,
    viewport: { width, height: 900 },
    locale: variant.locale === 'ar' ? 'ar-SA' : 'en-US',
  })
  await ctx.addCookies([{ name: 'locale', value: variant.locale, url: BASE_URL }])
  await ctx.addInitScript((theme) => {
    try { localStorage.setItem('theme', theme) } catch {}
  }, variant.theme)

  const page = await ctx.newPage()
  const consoleErrors = []
  const failedRequests = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`))
  page.on('response', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/') && r.status() >= 400) {
      failedRequests.push({ method: r.request().method(), path: u.pathname + u.search, status: r.status() })
    }
  })

  const started = Date.now()
  let status = 0
  let navError = null
  try {
    const resp = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    status = resp?.status() ?? 0
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  } catch (e) {
    navError = String(e.message).split('\n')[0]
  }
  const loadMs = Date.now() - started

  const result = {
    role, route, locale: variant.locale, theme: variant.theme, width,
    status, navError, loadMs, finalUrl: new URL(page.url()).pathname,
    consoleErrors, failedRequests,
  }

  if (!navError) {
    Object.assign(result, await page.evaluate(({ allow }) => {
      const allowRe = new RegExp(allow.source, allow.flags)
      const html = document.documentElement
      const overflowX = document.documentElement.scrollWidth - window.innerWidth
      const h1 = document.querySelector('main h1, main h2, h1, h2')?.textContent?.trim() || ''
      const bodyText = document.body.innerText || ''
      // Untranslated chrome: Latin words in headings, labels, buttons, table headers, nav, placeholders.
      const latin = new Set()
      if (html.lang === 'ar') {
        const chrome = document.querySelectorAll('h1,h2,h3,h4,label,button,th,nav a,[role="tab"],option,legend,summary')
        for (const el of chrome) {
          const t = (el.textContent || '').trim().replace(/\s+/g, ' ')
          if (!t || t.length > 80) continue
          if (/[A-Za-z]{3,}/.test(t) && !/[؀-ۿ]/.test(t) && !allowRe.test(t)) latin.add(t)
        }
        for (const el of document.querySelectorAll('input[placeholder],textarea[placeholder]')) {
          const t = el.getAttribute('placeholder') || ''
          if (/[A-Za-z]{3,}/.test(t) && !/[؀-ۿ]/.test(t) && !allowRe.test(t) && !/@|\.\w{2,}$/.test(t)) latin.add(`placeholder: ${t}`)
        }
      }
      const iconButtonsNoLabel = Array.from(document.querySelectorAll('button')).filter((b) => {
        const txt = (b.textContent || '').trim()
        return !txt && !b.getAttribute('aria-label') && !b.getAttribute('title') && b.offsetParent !== null
      }).length
      return {
        htmlLang: html.lang, htmlDir: html.dir, dark: html.classList.contains('dark'),
        heading: h1.slice(0, 120), overflowX,
        emptyState: /no .* (found|yet)|لا توجد|لم يتم العثور/i.test(bodyText),
        errorState: /something went wrong|failed to load|حدث خطأ/i.test(bodyText),
        untranslated: Array.from(latin).slice(0, 40),
        iconButtonsNoLabel,
      }
    }, { allow: { source: LATIN_ALLOWLIST.source, flags: LATIN_ALLOWLIST.flags } }))

    if (axe) {
      await page.addScriptTag({ content: AXE_SOURCE })
      result.axe = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { resultTypes: ['violations'], runOnly: ['wcag2a', 'wcag2aa'] })
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }))
      }).catch((e) => [{ id: 'axe-error', impact: 'n/a', nodes: 0, help: String(e).slice(0, 200) }])
    }

    if (screenshot) {
      const name = `${role}_${route.replace(/^\/dashboard\/?/, '').replace(/\//g, '_') || 'home'}_${variant.locale}-${variant.theme}_${width}.jpg`
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, 'detail')
      await page.screenshot({ path: path.join(SCREENS, name), type: 'jpeg', quality: 55 })
      result.screenshot = `screens/${name}`
    }
  }

  await ctx.close()
  return result
}

async function main() {
  // PW_CHROMIUM lets environments with a pre-installed browser skip `playwright install`.
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const results = []
  const roles = process.env.UAT_FULL ? Object.keys(USERS) : ['admin', 'viewer']

  for (const role of roles) {
    const state = await login(browser, role)
    for (const route of ROUTES) {
      const plan = []
      if (role === 'admin') {
        for (const v of VARIANTS) plan.push({ v, w: 1440, screenshot: v.theme === 'light', axe: true })
        for (const w of WIDTHS.slice(1)) {
          plan.push({ v: VARIANTS[0], w, screenshot: w === 390, axe: false })
          plan.push({ v: VARIANTS[2], w, screenshot: w === 390, axe: false })
        }
      } else {
        plan.push({ v: VARIANTS[0], w: 1440, screenshot: false, axe: false })
      }
      for (const { v, w, screenshot, axe } of plan) {
        const r = await visit(browser, state, role, route, v, w, { screenshot, axe })
        r.inSidebar = SIDEBAR.has(route)
        results.push(r)
        const flags = [
          r.navError && 'NAV', r.consoleErrors.length && `console:${r.consoleErrors.length}`,
          r.failedRequests.length && `api:${[...new Set(r.failedRequests.map((f) => f.status))].join('/')}x${r.failedRequests.length}`,
          r.overflowX > 1 && `overflow:${r.overflowX}`, r.untranslated?.length && `latin:${r.untranslated.length}`,
        ].filter(Boolean).join(' ')
        console.log(`${role.padEnd(9)} ${v.locale}-${v.theme.padEnd(5)} ${String(w).padStart(4)} ${String(r.loadMs).padStart(6)}ms ${route} ${flags}`)
      }
    }
  }

  await browser.close()
  const file = path.join(DATA, process.env.UAT_FILE || 'crawl-results.json')
  fs.writeFileSync(file, JSON.stringify(results, null, 1))
  console.log(`\n${results.length} visits written to ${file}`)
}

main().catch((e) => { console.error(e); process.exit(1) })

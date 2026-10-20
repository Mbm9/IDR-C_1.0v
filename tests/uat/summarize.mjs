#!/usr/bin/env node
/**
 * Summarise tests/uat/reports/data/crawl-results.json (and rbac-probe.json if present)
 * into tests/uat/reports/data/crawl-summary.md: one row per route with the worst value
 * seen across locale/theme/width variants.
 */
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.join(process.env.UAT_OUT || 'tests/uat/reports', 'data')
const results = JSON.parse(fs.readFileSync(path.join(DIR, 'crawl-results.json'), 'utf8'))

const byRoute = new Map()
for (const r of results) {
  if (!byRoute.has(r.route)) byRoute.set(r.route, [])
  byRoute.get(r.route).push(r)
}

const routeLabel = (route) => (route.replace(/^\/dashboard/, '') || '/').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')

const rows = []
const failedApis = new Map()
const consoleSamples = new Map()
const axeRules = new Map()
const latinSamples = new Map()

for (const [route, visits] of byRoute) {
  const admin = visits.filter((v) => v.role === 'admin')
  const viewer = visits.filter((v) => v.role === 'viewer')
  const maxLoad = Math.max(...admin.map((v) => v.loadMs))
  const consoleErr = Math.max(...admin.map((v) => v.consoleErrors.length))
  const apiFails = new Set()
  for (const v of visits) for (const f of v.failedRequests) {
    const key = `${f.method} ${f.path.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')} → ${f.status}`
    apiFails.add(key)
    if (!failedApis.has(key)) failedApis.set(key, new Set())
    failedApis.get(key).add(`${routeLabel(route)} (${v.role})`)
  }
  for (const v of admin) for (const c of v.consoleErrors) {
    const k = c.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').slice(0, 160)
    if (!consoleSamples.has(k)) consoleSamples.set(k, new Set())
    consoleSamples.get(k).add(routeLabel(route))
  }
  const axeSerious = new Set()
  for (const v of admin) for (const a of v.axe || []) {
    if (a.impact === 'serious' || a.impact === 'critical') axeSerious.add(a.id)
    const k = `${a.id} (${a.impact})`
    if (!axeRules.has(k)) axeRules.set(k, { help: a.help, routes: new Set(), variants: new Set() })
    axeRules.get(k).routes.add(routeLabel(route))
    axeRules.get(k).variants.add(`${v.locale}-${v.theme}`)
  }
  const overflow390 = Math.max(0, ...admin.filter((v) => v.width === 390).map((v) => v.overflowX || 0))
  const overflow768 = Math.max(0, ...admin.filter((v) => v.width === 768).map((v) => v.overflowX || 0))
  const latin = new Set()
  for (const v of admin.filter((x) => x.locale === 'ar')) for (const t of v.untranslated || []) latin.add(t)
  latinSamples.set(routeLabel(route), [...latin])
  const dirOk = admin.filter((v) => v.locale === 'ar').every((v) => v.htmlDir === 'rtl' && v.htmlLang === 'ar')
  const darkOk = admin.filter((v) => v.theme === 'dark').every((v) => v.dark)
  const iconNoLabel = Math.max(0, ...admin.map((v) => v.iconButtonsNoLabel || 0))
  const viewerFinal = viewer[0]?.finalUrl
  rows.push({
    route: routeLabel(route), sidebar: visits[0].inSidebar ? 'yes' : 'no', maxLoad, consoleErr,
    apiFails: apiFails.size, axeSerious: axeSerious.size, overflow390, overflow768,
    latin: latin.size, dirOk, darkOk, iconNoLabel,
    viewer: viewer.length ? (viewerFinal === viewer[0].route ? 'loads' : `→ ${viewerFinal}`) : 'n/a',
  })
}

const md = []
md.push('# UAT crawl summary', '')
md.push(`Visits: ${results.length}. Generated ${new Date().toISOString()}.`, '')
md.push('Worst value per route across EN/AR × light/dark at 1440 and EN/AR light at 1024/768/390 (admin), plus one viewer visit.', '')
md.push('| Route | Sidebar | Max load ms | Console errors | Failing API calls | Serious axe rules | Overflow px @390 | Overflow px @768 | Latin UI strings (AR) | AR dir/lang ok | Dark ok | Icon buttons without label | Viewer |')
md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  md.push(`| ${r.route} | ${r.sidebar} | ${r.maxLoad} | ${r.consoleErr} | ${r.apiFails} | ${r.axeSerious} | ${r.overflow390} | ${r.overflow768} | ${r.latin} | ${r.dirOk ? 'yes' : 'NO'} | ${r.darkOk ? 'yes' : 'NO'} | ${r.iconNoLabel} | ${r.viewer} |`)
}

md.push('', '## Failing API calls during page loads', '')
md.push('| Call | Seen on |', '|---|---|')
for (const [k, v] of [...failedApis].sort()) md.push(`| \`${k}\` | ${[...v].slice(0, 6).join(', ')}${v.size > 6 ? ` +${v.size - 6}` : ''} |`)

md.push('', '## Console errors (admin)', '')
md.push('| Message | Routes |', '|---|---|')
for (const [k, v] of [...consoleSamples].sort((a, b) => b[1].size - a[1].size).slice(0, 40)) {
  md.push(`| ${k.replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${[...v].slice(0, 5).join(', ')}${v.size > 5 ? ` +${v.size - 5}` : ''} |`)
}

md.push('', '## Accessibility (axe-core, WCAG 2.1 A/AA)', '')
md.push('| Rule | What it checks | Routes | Variants |', '|---|---|---|---|')
for (const [k, v] of [...axeRules].sort((a, b) => b[1].routes.size - a[1].routes.size)) {
  md.push(`| ${k} | ${v.help} | ${v.routes.size} routes | ${[...v.variants].join(', ')} |`)
}

md.push('', '## Untranslated UI strings in Arabic (headings, labels, buttons, table headers, placeholders)', '')
for (const [route, list] of latinSamples) {
  if (list.length) md.push(`- **${route}** (${list.length}): ${list.slice(0, 15).map((t) => `"${t.replace(/\|/g, '/')}"`).join(', ')}${list.length > 15 ? ', …' : ''}`)
}

const rbacPath = path.join(DIR, 'rbac-probe.json')
if (fs.existsSync(rbacPath)) {
  const rbac = JSON.parse(fs.readFileSync(rbacPath, 'utf8'))
  const roles = ['viewer', 'analyst', 'iam_admin', 'ciso', 'admin']
  const keys = [...new Set(rbac.map((r) => r.key))]
  md.push('', '## RBAC probe (empty body, random path IDs)', '')
  md.push('Cell = HTTP status. 401/403 means the role gate fired; any other code means the request passed authorization.', '')
  md.push(`| Endpoint | ${roles.join(' | ')} |`, `|---|${roles.map(() => '---').join('|')}|`)
  for (const k of keys) {
    md.push(`| \`${k}\` | ${roles.map((role) => {
      const x = rbac.find((y) => y.role === role && y.key === k)
      if (!x) return ''
      if (x.skipped) return 'skip'
      return x.gated ? `${x.status}` : `**${x.status}**`
    }).join(' | ')} |`)
  }
}

fs.writeFileSync(path.join(DIR, 'crawl-summary.md'), md.join('\n') + '\n')
console.log(`Wrote ${path.join(DIR, 'crawl-summary.md')} (${rows.length} routes)`)

# Identity Radar — UAT and UI/UX Review Plan

Prepared 2026-10-13 from a full code review of `main` at `639f16c`.
Part A lists the review findings and their status after commit `c3644b9` and the UAT fixes.
Part B is the UAT programme. Results of the first run are in `uat-run-2026-10-13.md`.

---

## Part A — Code review findings and status

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Critical | Middleware returned 401 for `/api/cron/*`, so no scheduled job could run | Fixed. Cron routes pass middleware and share `lib/auth/cron.ts` |
| 2 | High | Body-less POST/PATCH/DELETE got 415, breaking ~13 UI actions | Fixed. Content-Type is enforced only when a body is present |
| 3 | High | Onboarding bypassed role checks, SSRF guard and credential encryption | Fixed. Same guards as the integrations and team APIs |
| 4 | High | Role changes and session revocation never took effect until re-login | Fixed. JWT callback re-reads the user and validates `active_sessions` |
| 5 | High | Env validation never ran; compose defaulted to a public `NEXTAUTH_SECRET` | Fixed. `instrumentation.ts` validates at boot; compose requires the secret |
| 6 | High | Credentials stored in plaintext in production when `CREDENTIALS_KEY` was unusable | Fixed. `lib/connectors/store-config.ts` refuses in production |
| 7 | Med-High | Events ingest trusted foreign identity IDs; one bad timestamp failed the batch | Fixed |
| 8 | Medium | Rate limit keyed on spoofable `X-Forwarded-For`; port 3000 bypassed Caddy | Fixed. `X-Real-IP` or right-most hop, per-user keys, loopback port binding |
| 9 | Medium | Blast-radius narration hardcoded Ollama URL and model | Fixed. The other 10 copy-pasted AI clients remain (see recommendations) |
| 10 | Convention | ~36 mutation routes write no `action_log` entry | Partly fixed: role change, invitations, integrations, API keys, logins. Remaining routes listed in the UAT run report |

Also from the review, still open: invitations are never consumed by signup, `withApiHandler` is used by a minority of routes, and hardcoded English remains on several pages.

---

## Part B — UAT / UI-UX review plan (to execute later with Opus)

### B0. Objective and scope
Validate that Identity Radar v1.0 is fit for CISO / IAM Engineer / Security Analyst use in EN and AR (RTL), light and dark, desktop and tablet widths, against the 5 RBAC roles — and produce a prioritised, reproducible defect list plus UX recommendations. Scope = 33 dashboard pages, auth/onboarding (3 pages), 17 sidebar-surfaced routes + 16 direct-URL ("deferred") routes, header utilities (search/command palette, locale, theme, AI chat, notifications, user menu), keyboard shortcuts, quick-start checklist, demo banner.

### B1. Pre-conditions (do first)
1. Fix or explicitly waive blockers A#1, A#2 (A#2 blocks ~13 UI actions; A#1 blocks every "scanner-populated" page: attack paths, exposures, threats, shadow admins, peer analysis, briefings).
2. Bring up stack: `./deploy/scripts/docker-up.sh` (or `docker compose up -d && npm run dev`), `npm run db:seed`. Confirm `/api/health` = healthy, Ollama model loaded (AI pages degrade gracefully otherwise — record which).
3. Create one user per role (viewer, analyst, iam_admin, ciso, admin) in the seeded org (via `settings/team` PUT or direct SQL) — needed for RBAC matrix. Note A#4: role changes require re-login.
4. Align E2E fixture credentials with seed (`admin@acmefs.sa` / `SEED_ADMIN_PASSWORD`) so `npm run test:e2e` is usable as a smoke gate.
5. Decide AR reviewer: a native Arabic reader must sign off on terminology/RTL.

### B2. Personas and journeys (acceptance per journey)
- CISO: login → dashboard attention band → compliance → executive PDF report → approve/reject AI remediation plan (`/dashboard/ai`, requires ciso) → audit log shows it.
- IAM Engineer (iam_admin): add integration via wizard → test connection → sync → identities populated → tiering violations → update tier (rationale required) → certify/revoke entitlement → audit log.
- Analyst: violations → acknowledge → trigger review → threats → triage → canaries → notifications mark read.
- Viewer: every page readable; every mutation control hidden or disabled; API returns 403 if forced.
- New customer: signup → onboarding (org → integration/CSV/demo → team) → dashboard; verify session refresh after org creation (`refreshSession: true`), invitation visibility, and A#3/inert-invitation behaviour.

### B3. Test matrix (each cell: EN-LTR-light, EN-dark, AR-RTL-light, AR-dark; widths 1440 / 1024 / 768 / 390)
Pages (sidebar): dashboard, identities (+detail tabs), tiering, entitlements, exposures, tier0-live, attack-paths (+detail), blast-radius, graph, graph-explorer, issues, violations, compliance, import, integrations, audit, settings (tabs: profile/prefs, team, api keys, webhooks, automation, sessions).
Pages (direct URL): ai, ai-chat, canaries, certifications, data-quality, docs, gpo (+detail), nhi, peer-analysis, remediation, reports, results, shadow-admins, supply-chain, threats (+detail).
For each page record: loads <3s with seed data; empty state (`components/ui/empty-state`) when no data; error state (`error-state`, `app/dashboard/error.tsx`) on API failure (simulate by stopping DB); loading skeletons; filters/search/pagination/sort; row → detail navigation; back navigation; CSV/PDF export; all buttons produce feedback (toast/inline) and an audit entry where applicable; no console errors; no hardcoded-English leakage in AR; no horizontal scroll at 390; logical-property RTL correctness (icons mirrored where directional, chevrons, sidebar slide direction, charts axes/legends, tables).

### B4. UX heuristic review (Nielsen + product-specific)
1. Visibility of system status: sync progress stream, cron health (`/api/metrics/cron-health`), integration-health strip, AI provider availability banner.
2. Match to domain: tier terminology (Tier 0/1/2 badges), NCA ECC / SAMA CSF / PDPL mappings, glossary (`lib/glossary.ts`) tooltips present on first-use terms.
3. User control: destructive actions (revoke, delete webhook/rule/canary, update tier) need confirm + rationale; undo or clear audit trail.
4. Consistency: `metric-card` vs `stat-tile` duplication; chart theming (`chart-theme.tsx`) across Recharts/D3; severity colour tokens via CSS variables only (grep for hex literals — e.g. demo banner uses inline hex).
5. Error prevention: forms validate before submit (integration wizard per-connector fields, CSV mapping preview, team invite email).
6. Recognition: command palette (⌘K) and shortcuts help dialog discoverable; keyboard-only navigation of tables and dialogs; focus rings visible in both themes.
7. Accessibility: WCAG 2.1 AA contrast in dark mode for severity badges; aria-labels on icon-only buttons (sidebar collapse, theme, locale, chat); dialog focus trap; `lang`/`dir` set on `<html>` after locale switch (full reload — assess perceived cost).
8. Help: `/dashboard/docs` (1815 lines) reachable from header; context help tooltips.
9. Performance perception: graph pages with 200+ nodes (limit control), identity table virtualisation, React Query staleness (30s) vs user expectation after mutations (verify invalidation after every action).
10. Trust: "AI never writes directly" — every AI output labelled as recommendation; approval flow explicit; model/provider shown.

### B5. RBAC matrix (API + UI) — must be tested per role
Actions: acknowledge, trigger-review, certify, revoke, update-tier, approve-exception, escalate, approve AI plan, manage integrations/webhooks/automation/canaries/detection rules, import CSV/demo, team/role management, API keys, settings. Expected: UI hides/disables + API 403 below required role. Only 4 UI files gate on role today (`app/dashboard/ai`, `settings`, `identity-detail-header`, `header`) → expect many pages to show controls that then 403; log each as a defect.

### B6. Non-functional checks folded into UAT
- Security smoke: A#5/A#6 config in `.env`; `/api/cron/*` only with Bearer; 415/413 behaviour; CORS origin; cookies secure in prod; logout clears session.
- Data: seed realism (Arabic names, .sa domains), numbers reconcile across dashboard tiles vs list pages vs exports.
- i18n: `messages/en.json` and `ar.json` have 836 keys each with full parity; defects are therefore hardcoded strings in TSX, date/number formatting (`lib/utils/formatters.ts`), and plural/RTL punctuation.

### B7. Defect classification and exit criteria
- S1 Blocker: data loss, security, cannot complete a persona journey. S2 Major: feature broken but workaround. S3 Minor: cosmetic/RTL/contrast. S4 Enhancement.
- Exit: 0 S1, ≤3 S2 with owners, all five persona journeys pass in EN and AR, E2E smoke green, audit log contains an entry for every mutation exercised.

### B8. Deliverables the Opus session must produce
1. `tests/uat/reports/uat-run-<date>.md` — matrix results per page × variant with screenshots (Playwright `page.screenshot`) under `tests/uat/reports/screens/`.
2. Defect register (CSV or table) with id, severity, page, role, locale/theme, steps, expected/actual, screenshot path, suspected file:line.
3. UX recommendations ranked by impact/effort, each tied to a component path.
4. Updated/added Playwright specs for the five persona journeys and the RBAC negative cases (login fixture aligned to seed; per-role storageState).
5. Short executive summary for the CISO stakeholder.

### B9. Execution plan for the Opus session (ordered)
1. Read this file and `CLAUDE.md`; run `git log -5`; confirm blockers A#1–A#2 status (fixed or waived).
2. Stand up the stack; seed; create role users; run `npm run test:e2e` as smoke.
3. Write a Playwright crawler that logs in per role, visits every route in B3 across the 4 locale/theme variants and 4 widths, captures screenshot + console errors + failed network calls + axe-core scan; store JSON.
4. Manually (via browser automation) execute the five B2 journeys; verify audit log and notifications after each mutation.
5. Review the crawl output against B3/B4/B5 checklists; file defects; map each to code.
6. Produce B8 deliverables; propose fixes grouped as "quick wins (<1h)", "sprint", "design decision".
Suggested Opus prompt stub: "Execute Part B of tests/uat/reports/uat-plan.md against /home/user/IDR-C_1.0v. Do not change product code except the E2E fixture credentials and new specs; record all findings in tests/uat/reports/."

### B10. How to run the automated parts

```bash
# 1. Database: schema, views, seed, one user per role
npm run db:push
psql "$DATABASE_URL" -f drizzle/0001_create_views.sql
SEED_ADMIN_PASSWORD='...' npm run db:seed
psql "$DATABASE_URL" -v password='...' -f tests/uat/create-role-users.sql

# 2. App with a raised API limit so the crawler is not throttled
npm run build && RATE_LIMIT_API_PER_MIN=5000 npm start

# 3. Populate scanner-driven pages (what the external scheduler does)
for j in $(ls app/api/cron); do curl -s -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/$j; done

# 4. Crawl, RBAC probe, E2E
SEED_ADMIN_PASSWORD='...' UAT_PASSWORD='...' node tests/uat/crawl.mjs
SEED_ADMIN_PASSWORD='...' UAT_PASSWORD='...' node tests/uat/rbac-probe.mjs
SEED_ADMIN_PASSWORD='...' E2E_USER_PASSWORD='...' CRON_SECRET='...' npx playwright test
```

Set `PW_CHROMIUM=/path/to/chrome` to use a pre-installed browser.
Run the E2E suite against an app with a raised `RATE_LIMIT_API_PER_MIN`, or leave a minute between runs: back-to-back runs share the signed-in users' per-minute budget.
`tests/uat/summarize.mjs` turns the crawl and RBAC output into `data/crawl-summary.md`; `tests/uat/ui-rbac.mjs` lists mutation controls a viewer can see.

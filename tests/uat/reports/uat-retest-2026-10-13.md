# UAT Retest — 2026-10-13

Retest of every open defect from `uat-run-2026-10-13.md` after the fix round, on branch `ccr-2f1a4d7c-rx7ma6`.
Raw data is in `retest/data/`, screenshots in `retest/screens/`, and the register is `defect-register.csv`.

## Outcome

All automated exit criteria in plan section B7 are now met.
Every defect in the register is fixed: the 19 open after the first run, and 9 more found and fixed during the fix round.
Two criteria still need people: a native Arabic reader's terminology sign-off, and the manual checks listed at the end.

| Check | First run | Retest |
|---|---|---|
| Visits (36 routes, EN/AR × light/dark × 4 widths, admin and viewer) | 396 | 396 |
| Console errors | 48 | 0 |
| Failing API calls during page loads | 26 | 0 |
| Serious or critical accessibility issues (route × rule) | 55 | 0 |
| Pages overflowing at 390 px | 1 | 0 |
| Distinct English UI strings in Arabic | 163 | 0 (55 remaining are data: names and acronyms) |
| Mutation controls a viewer can see | 16 | 0 |
| Mutation endpoints returning 500 in the RBAC probe | 3 | 0 |
| Role gates that differ from the CLAUDE.md role table | 0 | 0 |
| Median / worst page load | 0.94 s / 1.7 s | 0.95 s / 1.9 s |
| E2E tests | 42 of 42 | 45 of 45 (three back-to-back runs) |
| Unit tests | 217 | 377 |
| Production build warnings ("Dynamic server usage") | ~40 | 0 |

## What remains in Arabic as Latin script

All of it is data or a proper name rather than interface text:

- people's and service accounts' names;
- integration names stored in the database;
- the brand "Identity Radar" and acronyms such as AD, NCA ECC and SAMA CSF;
- GPO names such as "Default Domain Controllers Policy".

## Environment and method

Same as the first run: a production build, the seeded database, one user per role, and all 16 cron jobs run with the bearer secret (all returned 200).
`AI_PROVIDER=none`, so AI features ran their labelled deterministic fallbacks and `/api/health` reported AI as "unconfigured".
The crawl ran with `RATE_LIMIT_API_PER_MIN=5000`. The Playwright config now starts its server with raised limits too, because the suite reuses one admin account.

## Defects and resolutions

| ID | Sev | Status | Where | Resolution |
|---|---|---|---|---|
| UAT-101 | S2 | Fixed | 12 pages | Controls hidden or disabled with a "Requires the X role" hint via useAppRole/RoleGate; viewer UI check lists 0 controls (was 16). |
| UAT-102 | S2 | Fixed | 30+ pages | ~2,300 EN/AR keys across all pages; docs, issue catalog, compliance controls, briefings, notifications and executive report served in Arabic. Remaining Latin text is data (names, DB integration names) and acronyms. |
| UAT-103 | S2 | Fixed | /dashboard/identities, /dashboard/violations | Locale-aware formatters (Intl.RelativeTimeFormat), <bdi> for mixed-direction data, non-wrapping mirrored tier badges, RTL-aware chart axes, logical properties. |
| UAT-104 | S2 | Fixed | all 36 routes | Accessible colour tokens (--text-tertiary, --color-*-text), names for selects/checkboxes/icon buttons, ARIA tabs, SVG text alternatives, focusable scroll regions; 0 serious/critical axe rules on 36 routes. |
| UAT-105 | S2 | Fixed | /dashboard/tier0-live | Neutral "Preview" badge until real session telemetry; LIVE only with real data. |
| UAT-106 | S3 | Fixed | /dashboard/integrations | last_sync_error column (credential-stripped) shown with Retry sync / Reconnect; PATCH /api/integrations/[id]; brand display names. |
| UAT-107 | S3 | Fixed | /dashboard/exposures | Exposures layout fixed; 0 px overflow at 390. |
| UAT-108 | S3 | Fixed | /api/issues/[fsid], /api/gpo, /api/automation-rules/[id] | parseJsonBody helper; malformed JSON and schema failures return 400 with field errors; RBAC probe shows 0 endpoints returning 500. |
| UAT-109 | S3 | Fixed | /dashboard/graph | Selected view mode visible; dense graphs label only Tier 0, violating, hovered and selected nodes; labels toggle. |
| UAT-110 | S3 | Fixed | /dashboard | Y axis widened with top margin; "100" fully visible. |
| UAT-111 | S3 | Fixed | /dashboard/attack-paths | ICU plurals with full Arabic plural forms on all count strings. |
| UAT-112 | S3 | Fixed | /dashboard/settings | Scrollable, keyboard-navigable tabs with edge fades; Sessions tab with confirmed revoke. |
| UAT-113 | S4 | Fixed | /dashboard/identities | Rows open the identity on click (ctrl/cmd for new tab); name link kept. |
| UAT-114 | S3 | Fixed | /dashboard/identities | Per-day score history in risk_factors; velocity from history. Trends appear after a second day of scoring (no back-fill by design). |
| UAT-115 | S2 | Fixed | /dashboard/settings (team), /signup | Signup with a valid single-use invite link joins the inviting org with the invited role; seat limits enforced; admins revoke invitations; links shown once and emailed when SMTP is configured. |
| UAT-116 | S2 | Fixed | /dashboard/settings (API keys) | Bearer idr_ keys authenticate POST /api/events/ingest (prefix lookup + bcrypt, revoked/expired rejected); limited per key and per IP; demo org on a tier with API access. |
| UAT-117 | S3 | Fixed | canaries, detection/automation rules, webhooks, imports, data quality, threat status | 11 new action types; every mutation in canaries, rules, webhooks, GPO, imports, data quality, threats, findings, scans and remediation is audited without secrets. |
| UAT-118 | S3 | Fixed | /api/health, AI pages | lib/ai/client.ts replaces 13 copies; health probes the provider (2s timeout, 30s cache); outputs carry generatedBy/provider/model. |
| UAT-119 | S4 | Fixed | n/a | export const dynamic = 'force-dynamic' on the session-reading GET routes the build tried to prerender. |
| UAT-201 | S1 | Fixed | /api/sync/stream | Requires iam_admin, decrypts first, audits the sync |
| UAT-202 | S2 | Fixed | /signup | Single-use invite link token required (hash stored) |
| UAT-203 | S2 | Fixed | /dashboard/threats/:id, /dashboard/remediation | FK columns no longer set; actor recorded in action_log |
| UAT-204 | S2 | Fixed | Remediation execution | FK column no longer set; approver in action_log |
| UAT-205 | S2 | Fixed | /api/data-quality/suggestions | Fixed allow-list of descriptive fields |
| UAT-206 | S3 | Fixed | /api/webhooks/[id] PUT | Secret removed from response |
| UAT-207 | S3 | Fixed | /dashboard/ai | New enum value deterministic |
| UAT-208 | S3 | Fixed | /dashboard/graph | Pills derived from active factor flags |
| UAT-209 | S3 | Fixed | /onboarding, header chat, notifications | Fixed |

## Changes to the database

These were applied to the UAT database directly, because `drizzle-kit push` stops at an interactive prompt in this environment:

- `integration_sources.last_sync_error` (text, nullable);
- `invitations.token_hash` (text, unique);
- 11 new `action_type` values and `plan_generated_by = 'deterministic'`;
- an enterprise subscription for the seeded demo organization.

A fresh `npm run db:push` creates all of them from the schema.

## Still to do by hand

- A native Arabic reader reviews terminology on every page, including the docs, issue catalog and compliance controls.
- Executive PDF and audit PDF content in both languages.
- The integration wizard against a sandbox directory tenant, including a first sync.
- AI features with Ollama running: narration, triage, chat, plan generation, and Arabic briefing translation.
- A keyboard-only pass through the command palette, dialogs and tables.

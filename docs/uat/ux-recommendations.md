# UX Recommendations — UAT 2026-10-13

Ranked by impact on the target users (CISO, IAM engineer, analyst; Arabic and English) against effort.
Each item names the component to change and the defect it closes.

## Quick wins (under an hour each)

1. **Raise sidebar section-label contrast.** `text-slate-500` on the `#0f172b` sidebar is 3.74:1 on every page. Use `text-slate-400` or a `--text-sidebar-muted` token. File: `components/dashboard/sidebar.tsx`. Closes part of UAT-104.
2. **Label every select and icon-only button.** Add `aria-label` to the filter selects (10 routes) and to the send and filter icon buttons on results and AI chat. Closes the critical axe rules in UAT-104.
3. **Make the Tier 0 Live badge honest.** Show a grey "Preview" badge while the session collector is off, and the red "LIVE" badge only with real telemetry. File: `app/dashboard/tier0-live/page.tsx`. Closes UAT-105.
4. **Use ICU plurals for counts.** "1 hops", "1 identities" and similar; next-intl supports `{count, plural, one {# hop} other {# hops}}`. Closes UAT-111.
5. **Give the risk chart's Y axis room.** Set `width` or a left margin on the Recharts `YAxis` so "100" is not clipped. File: `components/charts/risk-trend.tsx`. Closes UAT-110.
6. **Fix the selected view-mode button on the graph page.** The active "Force" button renders white on white. Closes part of UAT-109.
7. **Map connector types to display names.** Use a lookup ("Azure AD / Entra ID", "CyberArk", "ServiceNow") instead of title-casing enum values. File: `app/dashboard/integrations/page.tsx`. Closes part of UAT-106.
8. **Return 400 for invalid input.** Replace `schema.parse` with `safeParse` in the issues, GPO and automation-rule routes. Closes UAT-108.

## Sprint work (one to five days)

1. **Hide controls the user cannot use.** Add a `useAppRole()` hook (session `appRole` plus `hasRole`) and wrap the 16 controls in `data/ui-rbac-viewer.json`. Show a disabled button with a tooltip ("Requires Analyst") where the action is worth advertising. Closes UAT-101, the most visible RBAC gap.
2. **Finish Arabic coverage.** Move the hardcoded strings listed per route in `data/crawl-summary.md` into `messages/*.json`. Prioritise in this order:
   - the identities table headers and cell values;
   - the integrations page;
   - the import wizard;
   - graph explorer queries;
   - AI chat suggestions;
   - the header role label.

   Generate the daily briefing text from message keys with parameters rather than English sentences. Add the scanner used here (`tests/uat/crawl.mjs`, "Latin UI strings") to CI as a guard. Closes UAT-102.
3. **Fix bidi for mixed content.** Format relative times with `Intl.RelativeTimeFormat` in the active locale (no English fragments inside RTL text). Wrap identifiers and English data in `<bdi>`. Keep tier badges on one line with `whitespace-nowrap`. Closes UAT-103.
4. **Make charts RTL-aware.** Translate violation-type labels instead of showing enum keys, and give vertical bar charts a label column wide enough for Arabic at 390 px. File: `components/charts/violation-breakdown.tsx`. Closes the rest of UAT-103.
5. **Explain integration errors.** Store the last sync error message and show it with a "Retry" and "Edit credentials" action on the card. Closes UAT-106.
6. **Add a Sessions tab to settings.** The list and revoke API now works (sessions are recorded at sign-in); the UI is missing. Make the tab bar scroll with a fade hint on mobile. Closes UAT-112.
7. **Make identity rows clickable.** Navigate on row click and keep the name link for keyboard and middle-click users. Closes UAT-113.
8. **Reduce graph label clutter.** Show labels only for hovered, selected and Tier 0 nodes above about 30 nodes. Closes the rest of UAT-109.

## Design decisions (need a product call)

1. **Invitation acceptance.** Decide how an invited user joins: a signup link with a token, or signup matching a pending invitation by email. Today invitations are recorded but ignored (UAT-115).
2. **API-key authentication.** Decide which endpoints accept API keys (SIEM event ingest at least) and whether the free tier gets any. Today keys can be created on paid tiers but nothing accepts them (UAT-116).
3. **Risk history.** The dashboard trend now uses the daily-briefing snapshots, so it starts sparse on a new install. Decide whether to back-fill from `assess_identity` history or show an explicit "collecting history" state. The same decision unblocks the velocity column (UAT-114).
4. **One AI client.** Ten routes carry their own Ollama/Anthropic fetch code with different timeouts and fallbacks. Consolidate into `lib/ai/client.ts`, and have `/api/health` probe the model instead of trusting `OLLAMA_URL` (UAT-118).
5. **Audit coverage.** Decide the action types for canaries, detection and automation rules, webhooks, imports and data-quality actions so every mutation lands in `action_log` (UAT-117, CLAUDE.md rule 1).

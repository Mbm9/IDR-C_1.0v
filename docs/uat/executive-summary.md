# Identity Radar v1.0 — UAT Executive Summary

**Date:** 13 October 2026 · **Audience:** CISO and product owner

## Verdict

Identity Radar is not ready for customer acceptance yet, but the remaining work is bounded.
Every blocking defect found has been fixed and re-tested.
What remains is Arabic completeness, accessibility and permission-aware screens, plus two product decisions.

## What changed during this cycle

The code review and the first UAT run found and fixed issues that would have undermined trust in the product:

- **Scheduled analysis never ran.** Risk scoring, tier scans, threat detection and attack-path discovery were blocked before reaching their code. They now run on schedule, and the attack-path scanner, which also crashed, stores its results.
- **A headline dashboard number was invented.** The 30-day average-risk tile and chart showed random values on every load. They now show recorded history.
- **Access changes did not take effect.** Demoting a user or revoking a session only applied after the user logged in again, up to 30 days later. Both now apply on the next request.
- **Normal use was throttled.** Browsing about 25 pages a minute, or several staff behind one office IP, triggered "too many requests". Limits now apply per user, and login attempts are still capped.
- **Security gaps closed.** Onboarding could bypass role checks and store connector passwords unencrypted. Viewers could wipe analyst triage work and send organisation-wide notifications. Production could start with a publicly known signing key.
- **Audit evidence was incomplete.** The audit trail did not name who acted, and role changes, invitations, integrations and API keys were not logged. These are now recorded, which matters for NCA ECC and SAMA CSF evidence.

## Where it stands

| Area | Status |
|---|---|
| All 36 screens load in English and Arabic, light and dark | Yes, median 0.9 s |
| Permissions enforced by the server for all five roles | Yes, 69 actions × 5 roles verified |
| Screens hide actions a role cannot perform | No: viewers see 16 buttons that then fail |
| Arabic interface complete | No: English remains on about 30 screens |
| Accessibility (WCAG 2.1 AA) | No: contrast and labelling issues on every screen |
| Automated regression tests | 42 end-to-end and 217 unit tests passing |

## Decisions needed

1. How invited colleagues join an organisation. Invitations are recorded but not yet used.
2. Which integrations may authenticate with API keys, for example SIEM event feeds.
3. Whether to back-fill risk history or show "collecting history" on new installations.

## Recommended next step

Plan one sprint covering permission-aware screens, Arabic completion with a native reviewer, and the accessibility fixes.
Then repeat this UAT with the same scripts.
The detailed findings are in `uat-run-2026-10-13.md`, `defect-register.csv` and `ux-recommendations.md`.

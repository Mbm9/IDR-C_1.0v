# Identity Radar v1.0 — UAT Executive Summary

**Date:** 13 October 2026 (updated after the retest) · **Audience:** CISO and product owner

## Verdict

Identity Radar is ready for customer acceptance, subject to two human checks.
Every defect found in review and testing is fixed and re-tested.
What remains is a native Arabic reader's sign-off on terminology, and hands-on checks against real directory and AI systems.

## What changed

The first review and UAT run found problems that would have undermined trust. All are fixed:

- **Scheduled analysis now runs.** Risk scoring, tier scans, threat detection and attack-path discovery run on schedule and store their results.
- **Dashboard numbers are real.** The 30-day risk trend shows recorded history instead of random values.
- **Access changes apply immediately.** Demoting a user or revoking a session takes effect on the next request.
- **Screens respect roles.** Viewers no longer see buttons they cannot use, and the server refuses every action above a user's role.
- **Arabic is complete.** Every screen, the in-app documentation, the issue catalogue and the compliance controls are in Arabic. Only names and acronyms remain in Latin script.
- **Accessibility meets WCAG 2.1 AA.** Automated checks find no serious issues on any screen, in either language or theme.
- **Security gaps closed.** Joining an organisation requires a single-use invitation link. Connector passwords are always encrypted. Machine integrations can authenticate with revocable API keys.
- **Audit evidence is complete.** Every change, including role changes, invitations, integrations and API keys, appears in the audit trail with who made it. This matters for NCA ECC and SAMA CSF evidence.
- **AI output is labelled.** Every AI result states whether a model or the rule-based fallback produced it, and the health check shows whether the AI service is reachable.

## Where it stands

| Area | Status |
|---|---|
| All 36 screens load in English and Arabic, light and dark, desktop to phone | Yes, median 0.95 s |
| Server enforces permissions for all five roles | Yes, 71 actions × 5 roles verified |
| Screens hide actions a role cannot perform | Yes |
| Arabic interface complete | Yes; terminology sign-off pending |
| Accessibility (WCAG 2.1 AA, automated) | Yes |
| Automated regression tests | 45 end-to-end and 377 unit tests passing |

## Decisions taken

1. **Invitations:** invited colleagues join through a single-use link that expires after seven days. The link is emailed when email is configured, otherwise shown once to the administrator.
2. **API keys:** keys authenticate SIEM event feeds only, with organisation-scoped, revocable keys.
3. **Risk history:** history builds from daily snapshots. A new installation shows trends after its second day rather than back-filled data.

## Recommended next step

1. A native Arabic reviewer checks terminology.
2. Run the integration wizard against a sandbox directory and the AI features with Ollama enabled.
3. Then sign off acceptance.

The details are in `uat-retest-2026-10-13.md` and `defect-register.csv`.

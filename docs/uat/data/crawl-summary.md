# UAT crawl summary

Visits: 396. Generated 2026-10-13T07:31:44.280Z.

Worst value per route across EN/AR × light/dark at 1440 and EN/AR light at 1024/768/390 (admin), plus one viewer visit.

| Route | Sidebar | Max load ms | Console errors | Failing API calls | Serious axe rules | Overflow px @390 | Overflow px @768 | Latin UI strings (AR) | AR dir/lang ok | Dark ok | Icon buttons without label | Viewer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| / | yes | 1299 | 1 | 0 | 1 | 0 | 0 | 4 | yes | yes | 0 | loads |
| /identities | yes | 1106 | 0 | 0 | 1 | 0 | 0 | 12 | yes | yes | 0 | loads |
| /tiering | yes | 1050 | 0 | 0 | 1 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /entitlements | yes | 1064 | 0 | 0 | 2 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /exposures | yes | 1176 | 0 | 0 | 2 | 30 | 0 | 11 | yes | yes | 0 | loads |
| /tier0-live | yes | 1067 | 0 | 0 | 1 | 0 | 0 | 2 | yes | yes | 0 | loads |
| /attack-paths | yes | 1698 | 0 | 0 | 2 | 0 | 0 | 3 | yes | yes | 0 | loads |
| /blast-radius | yes | 1066 | 0 | 0 | 1 | 0 | 0 | 2 | yes | yes | 0 | loads |
| /graph | yes | 1168 | 0 | 0 | 2 | 0 | 0 | 8 | yes | yes | 0 | loads |
| /graph-explorer | yes | 1225 | 0 | 0 | 1 | 0 | 0 | 20 | yes | yes | 0 | loads |
| /issues | yes | 1154 | 0 | 0 | 1 | 0 | 0 | 5 | yes | yes | 0 | loads |
| /violations | yes | 1067 | 0 | 0 | 2 | 0 | 0 | 7 | yes | yes | 0 | loads |
| /compliance | yes | 985 | 0 | 0 | 1 | 0 | 0 | 6 | yes | yes | 0 | loads |
| /import | yes | 954 | 0 | 0 | 1 | 0 | 0 | 11 | yes | yes | 0 | loads |
| /integrations | yes | 948 | 0 | 0 | 1 | 0 | 0 | 13 | yes | yes | 0 | loads |
| /audit | yes | 1029 | 0 | 0 | 2 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /settings | yes | 1615 | 0 | 0 | 1 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /ai | no | 954 | 1 | 1 | 3 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /ai-chat | no | 1139 | 1 | 1 | 2 | 0 | 0 | 12 | yes | yes | 1 | loads |
| /canaries | no | 970 | 0 | 0 | 1 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /certifications | no | 929 | 0 | 0 | 1 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /data-quality | no | 940 | 0 | 0 | 1 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /docs | no | 1191 | 0 | 0 | 2 | 0 | 0 | 31 | yes | yes | 0 | loads |
| /gpo | no | 961 | 0 | 0 | 2 | 0 | 0 | 5 | yes | yes | 0 | loads |
| /nhi | no | 1091 | 0 | 0 | 1 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /peer-analysis | no | 960 | 0 | 0 | 1 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /remediation | no | 997 | 0 | 0 | 1 | 0 | 0 | 3 | yes | yes | 0 | loads |
| /reports | no | 935 | 0 | 0 | 2 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /results | no | 1298 | 0 | 0 | 4 | 0 | 0 | 7 | yes | yes | 1 | loads |
| /shadow-admins | no | 1053 | 0 | 0 | 2 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /supply-chain | no | 946 | 1 | 1 | 1 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /threats | no | 1020 | 0 | 0 | 3 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /identities/:id | no | 1236 | 0 | 0 | 1 | 0 | 0 | 14 | yes | yes | 0 | loads |
| /attack-paths/:id | no | 953 | 1 | 0 | 1 | 0 | 0 | 3 | yes | yes | 0 | loads |
| /gpo/:id | no | 958 | 0 | 0 | 1 | 0 | 0 | 7 | yes | yes | 0 | loads |
| /threats/:id | no | 955 | 0 | 0 | 2 | 0 | 0 | 2 | yes | yes | 0 | loads |

## Failing API calls during page loads

| Call | Seen on |
|---|---|
| `GET /api/ai/chat/sessions → 429` | /ai-chat (admin) |
| `GET /api/ai/plans → 429` | /ai (admin) |
| `GET /api/supply-chain/high-risk → 500` | /supply-chain (admin), /supply-chain (viewer) |

## Console errors (admin)

| Message | Routes |
|---|---|
| Failed to load resource: the server responded with a status of 429 (Too Many Requests) | /ai, /ai-chat |
| l: MISSING_MESSAGE: briefing (en)     at http://localhost:3000/_next/static/chunks/2586-b3e74460ad2cfbd6.js:1:46939     at t.createBaseTranslator (http://localh | / |
| l: MISSING_MESSAGE: briefing (ar)     at http://localhost:3000/_next/static/chunks/2586-b3e74460ad2cfbd6.js:1:46939     at t.createBaseTranslator (http://localh | / |
| Failed to load resource: the server responded with a status of 500 (Internal Server Error) | /supply-chain |
| Error: Minified React error #438; visit https://react.dev/errors/438?args[]=%5Bobject%20Object%5D for the full message or use the non-minified dev environment f | /attack-paths/:id |

## Accessibility (axe-core, WCAG 2.1 A/AA)

| Rule | What it checks | Routes | Variants |
|---|---|---|---|
| color-contrast (serious) | Elements must meet minimum color contrast ratio thresholds | 36 routes | en-light, en-dark, ar-light, ar-dark |
| select-name (critical) | Select element must have an accessible name | 10 routes | en-light, en-dark, ar-light, ar-dark |
| svg-img-alt (serious) | <svg> elements with an img role must have alternative text | 3 routes | en-light, en-dark, ar-light, ar-dark |
| label (critical) | Form elements must have labels | 2 routes | en-light, en-dark, ar-light, ar-dark |
| button-name (critical) | Buttons must have discernible text | 2 routes | en-light, en-dark, ar-light, ar-dark |
| nested-interactive (serious) | Interactive controls must not be nested | 1 routes | en-light, en-dark, ar-light, ar-dark |
| scrollable-region-focusable (serious) | Scrollable region must have keyboard access | 1 routes | en-light, en-dark, ar-light, ar-dark |

## Untranslated UI strings in Arabic (headings, labels, buttons, table headers, placeholders)

- **/** (4): "AAdmin UserAdmin", "Export Risk Summary", "briefing.todaysBriefing", "briefing.viewFull"
- **/identities** (12): "AAdmin UserAdmin", "Azure AD", "Name↕", "Type↕", "Sub-type↕", "AD Tier↕", "Risk↓", "Velocity↕", "Quality", "Status↕", "Source↕", "Last Logon↕"
- **/tiering** (1): "AAdmin UserAdmin"
- **/entitlements** (1): "AAdmin UserAdmin"
- **/exposures** (11): "AAdmin UserAdmin", "Critical12", "High45", "Medium10", "Low1", "Identity (42)", "Certificate (AD CS) (7)preview", "GPO (17)preview", "Secrets (2)preview", "Privilege Escalation(36)", "Credential Theft(32)"
- **/tier0-live** (2): "AAdmin UserAdmin", "No active Tier 0 sessions"
- **/attack-paths** (3): "AAdmin UserAdmin", "Table", "Graph"
- **/blast-radius** (2): "AAdmin UserAdmin", "Compare Mode"
- **/graph** (8): "AAdmin UserAdmin", "Force", "Hierarchy", "Radial", "Export", "Violations", "Accounts", "Graph Statistics"
- **/graph-explorer** (20): "AAdmin UserAdmin", "Query Library", "PathFinder", "Fix-First", "Shortest paths to Tier 0", "Paths from broadly-accessible identities", "Who can DCSync", "Dangerous ACLs into Tier 0", "Shadow admins", "Risky admins (risk > 50)", "Kerberoastable accounts", "Unconstrained delegation", "Identity", "Group", "Computer", …
- **/issues** (5): "AAdmin UserAdmin", "critical", "high", "medium", "low"
- **/violations** (7): "AAdmin UserAdmin", "Type", "Severity", "Status", "Identity", "Policy", "Detected"
- **/compliance** (6): "AAdmin UserAdmin", "Saudi Regulatory Compliance", "NCA ECC", "SAMA CSF", "PDPLPersonal Data Protection LawVersion: 202358% 3 1 2 0", "System Metrics (Compliance Inputs)"
- **/import** (11): "AAdmin UserAdmin", "Import AD Snapshot", "Step 1: Export from AD", "Step 2: Upload Files", "Step 3: Review & Analyze", "Command 1: Users & Service AccountsRequired", "Copy", "Command 2: Groups & MembershipsRequired", "Command 3: GPO Permissions & DelegationsOptional", "Skip — Load Demo Data Instead", "I have the CSV files →"
- **/integrations** (13): "AAdmin UserAdmin", "Corporate Active Directory", "Azure AD / Entra ID", "SailPoint IdentityNow", "CyberArk PAM", "Okta SSO", "ServiceNow ITSM", "BeyondTrust PAM", "DigiCert CertCentral", "Microsoft Defender for Identity", "SAP GRC Access Control", "HashiCorp Vault", "Splunk SIEM"
- **/audit** (1): "AAdmin UserAdmin"
- **/settings** (1): "AAdmin UserAdmin"
- **/ai** (1): "AAdmin UserAdmin"
- **/ai-chat** (12): "AAdmin UserAdmin", "+ New", "AI Security Analyst", "Who has Domain Admin access but hasn't logged in this month?", "Show me all orphaned service accounts", "Which identities have tier violations?", "How many identities are dormant?", "List all Tier 0 identities", "What are the top 5 riskiest identities?", "Show identities with missing MFA", "Which NHIs have no owner assigned?", "placeholder: Ask about identities, tiers, violations, risk..."
- **/canaries** (1): "AAdmin UserAdmin"
- **/certifications** (1): "AAdmin UserAdmin"
- **/data-quality** (1): "AAdmin UserAdmin"
- **/docs** (31): "AAdmin UserAdmin", "Documentation", "User Guide", "API Reference", "Connectors", "Compliance", "Overview Dashboard/dashboard", "Key Features", "Available Actions", "Identity Explorer/dashboard/identities", "Identity Detail/dashboard/identities", "AD Tiering/dashboard/tiering", "Entitlements/dashboard/entitlements", "Shadow Admins/dashboard/shadow-admins", "Attack Paths/dashboard/attack-paths", …
- **/gpo** (5): "AAdmin UserAdmin", "All Statuses", "Enabled", "Disabled", "Enforced"
- **/nhi** (1): "AAdmin UserAdmin"
- **/peer-analysis** (1): "AAdmin UserAdmin"
- **/remediation** (3): "AAdmin UserAdmin", "Remediation Queue", "Scan & Generate Proposals"
- **/reports** (1): "AAdmin UserAdmin"
- **/results** (7): "AAdmin UserAdmin", "Active", "Risk Score", "Identity", "Tier", "Risk", "Status"
- **/shadow-admins** (1): "AAdmin UserAdmin"
- **/supply-chain** (1): "AAdmin UserAdmin"
- **/threats** (1): "AAdmin UserAdmin"
- **/identities/:id** (14): "AAdmin UserAdmin", "msi-grafana-14", "Trigger Review", "Update Tier", "Certify All", "Disable", "Overview", "Accounts1", "Entitlements5", "Groups1", "Violations1", "Timeline0", "AI Insights", "Blast Radius"
- **/attack-paths/:id** (3): "AAdmin UserAdmin", "Something went wrong", "Try Again"
- **/gpo/:id** (7): "AAdmin UserAdmin", "Default Domain Controllers Policy", "Risks (2)", "GPO Links (1)", "Enabled", "Trustee", "Trustee Tier"
- **/threats/:id** (2): "AAdmin UserAdmin", "MITRE ATT&CK"

## RBAC probe (empty body, random path IDs)

Cell = HTTP status. 401/403 means the role gate fired; any other code means the request passed authorization.

| Endpoint | viewer | analyst | iam_admin | ciso | admin |
|---|---|---|---|---|---|
| `POST /api/actions/acknowledge` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/actions/approve-exception` | 403 | 403 | 403 | **400** | **400** |
| `POST /api/actions/certify` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/actions/escalate` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/actions/revoke` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/actions/trigger-review` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/actions/update-tier` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/ai/analyze` | 403 | **200** | **200** | **200** | **200** |
| `POST /api/ai/chat` | **400** | **400** | **400** | **400** | **400** |
| `DELETE /api/ai/chat/sessions/[id]` | **404** | **404** | **404** | **404** | **404** |
| `PUT /api/ai/plans` | 403 | 403 | 403 | **400** | **400** |
| `POST /api/attack-paths/[id]/narrate` | 403 | **404** | **404** | **404** | **404** |
| `POST /api/attack-paths` | skip | skip | skip | skip | skip |
| `POST /api/auth/signup` | skip | skip | skip | skip | skip |
| `POST /api/automation-rules/[id]/dry-run` | 403 | 403 | **404** | **404** | **404** |
| `PUT /api/automation-rules/[id]` | 403 | 403 | **500** | **500** | **500** |
| `DELETE /api/automation-rules/[id]` | 403 | 403 | **404** | **404** | **404** |
| `POST /api/automation-rules` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/automation-rules/templates` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/blast-radius/narrate` | **400** | **400** | **400** | **400** | **400** |
| `POST /api/blast-radius` | **400** | **400** | **400** | **400** | **400** |
| `PUT /api/canaries/[id]` | 403 | 403 | **404** | **404** | **404** |
| `DELETE /api/canaries/[id]` | 403 | 403 | **404** | **404** | **404** |
| `POST /api/canaries` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/certifications/smart-review` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/data-quality/classify` | 403 | 403 | **200** | **200** | **200** |
| `POST /api/data-quality/enrich` | 403 | 403 | **200** | **200** | **200** |
| `PATCH /api/data-quality/resolve` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/data-quality/resolve` | 403 | 403 | **200** | **200** | **200** |
| `POST /api/data-quality/suggestions` | 403 | 403 | **400** | **400** | **400** |
| `PUT /api/detection-rules/[id]` | 403 | 403 | **404** | **404** | **404** |
| `DELETE /api/detection-rules/[id]` | 403 | 403 | **404** | **404** | **404** |
| `POST /api/detection-rules` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/events/ingest` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/gpo` | 403 | 403 | **500** | **500** | **500** |
| `POST /api/gpo/scan` | skip | skip | skip | skip | skip |
| `POST /api/graph/simulate` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/import/csv` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/import/csv-detect` | **400** | **400** | **400** | **400** | **400** |
| `POST /api/import/demo` | skip | skip | skip | skip | skip |
| `POST /api/integrations` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/integrations/test` | 403 | 403 | **400** | **400** | **400** |
| `PATCH /api/issues/[fsid]` | 403 | **500** | **500** | **500** | **500** |
| `PATCH /api/notifications/[id]` | **404** | **404** | **404** | **404** | **404** |
| `POST /api/notifications/mark-all-read` | skip | skip | skip | skip | skip |
| `POST /api/notifications` | 403 | 403 | 403 | 403 | **400** |
| `PATCH /api/peer-anomalies/[id]` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/peer-groups` | skip | skip | skip | skip | skip |
| `PUT /api/remediation/[id]` | 403 | 403 | 403 | **400** | **400** |
| `POST /api/remediation` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/reports/generate` | **400** | **400** | **400** | **400** | **400** |
| `POST /api/settings/api-keys` | 403 | 403 | 403 | 403 | 403 |
| `DELETE /api/settings/api-keys` | 403 | 403 | 403 | 403 | **400** |
| `PUT /api/settings/preferences` | **200** | **200** | **200** | **200** | **200** |
| `DELETE /api/settings/sessions/[id]` | **404** | **404** | **404** | **404** | **404** |
| `POST /api/settings/team` | 403 | 403 | 403 | 403 | **400** |
| `PUT /api/settings/team` | 403 | 403 | 403 | 403 | **400** |
| `PATCH /api/shadow-admins/[id]` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/shadow-admins` | skip | skip | skip | skip | skip |
| `POST /api/supply-chain` | **400** | **400** | **400** | **400** | **400** |
| `POST /api/supply-chain/simulate-departure` | **400** | **400** | **400** | **400** | **400** |
| `POST /api/sync/[source]` | 403 | 403 | **400** | **400** | **400** |
| `PATCH /api/threats/[id]` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/threats/[id]/triage` | 403 | **404** | **404** | **404** | **404** |
| `POST /api/threats` | 403 | **400** | **400** | **400** | **400** |
| `PUT /api/webhooks/[id]` | 403 | 403 | **404** | **404** | **404** |
| `DELETE /api/webhooks/[id]` | 403 | 403 | **404** | **404** | **404** |
| `POST /api/webhooks/[id]` | 403 | 403 | **404** | **404** | **404** |
| `POST /api/webhooks` | 403 | 403 | **400** | **400** | **400** |

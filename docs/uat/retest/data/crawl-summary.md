# UAT crawl summary

Visits: 396. Generated 2026-10-13T13:39:31.400Z.

Worst value per route across EN/AR × light/dark at 1440 and EN/AR light at 1024/768/390 (admin), plus one viewer visit.

| Route | Sidebar | Max load ms | Console errors | Failing API calls | Serious axe rules | Overflow px @390 | Overflow px @768 | Latin UI strings (AR) | AR dir/lang ok | Dark ok | Icon buttons without label | Viewer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| / | yes | 1320 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /identities | yes | 1142 | 0 | 0 | 0 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /tiering | yes | 1276 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /entitlements | yes | 1058 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /exposures | yes | 1116 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /tier0-live | yes | 962 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /attack-paths | yes | 1132 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /blast-radius | yes | 958 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /graph | yes | 1193 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /graph-explorer | yes | 1159 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /issues | yes | 1030 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /violations | yes | 1002 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /compliance | yes | 967 | 0 | 0 | 0 | 0 | 0 | 2 | yes | yes | 0 | loads |
| /import | yes | 993 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /integrations | yes | 997 | 0 | 0 | 0 | 0 | 0 | 12 | yes | yes | 0 | loads |
| /settings | yes | 970 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /ai | no | 983 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /ai-chat | no | 1048 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /canaries | no | 1443 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /certifications | no | 941 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /data-quality | no | 997 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /docs | no | 1143 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /gpo | no | 1121 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /nhi | no | 1106 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /peer-analysis | no | 941 | 0 | 0 | 0 | 0 | 0 | 6 | yes | yes | 0 | loads |
| /remediation | no | 994 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /reports | no | 995 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /results | no | 1035 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /shadow-admins | no | 968 | 0 | 0 | 0 | 0 | 0 | 15 | yes | yes | 0 | loads |
| /supply-chain | no | 1022 | 0 | 0 | 0 | 0 | 0 | 20 | yes | yes | 0 | loads |
| /threats | no | 1028 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /identities/:id | no | 1008 | 0 | 0 | 0 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /attack-paths/:id | no | 1850 | 0 | 0 | 0 | 0 | 0 | 2 | yes | yes | 0 | loads |
| /gpo/:id | no | 942 | 0 | 0 | 0 | 0 | 0 | 1 | yes | yes | 0 | loads |
| /threats/:id | no | 954 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |
| /audit | yes | 1067 | 0 | 0 | 0 | 0 | 0 | 0 | yes | yes | 0 | loads |

## Failing API calls during page loads

| Call | Seen on |
|---|---|

## Console errors (admin)

| Message | Routes |
|---|---|

## Accessibility (axe-core, WCAG 2.1 A/AA)

| Rule | What it checks | Routes | Variants |
|---|---|---|---|

## Untranslated UI strings in Arabic (headings, labels, buttons, table headers, placeholders)

- **/identities** (1): "Azure AD"
- **/compliance** (2): "NCA ECC", "SAMA CSF"
- **/integrations** (12): "Corporate Active Directory", "Azure AD / Entra ID", "CyberArk PAM", "SailPoint IdentityNow", "ServiceNow ITSM", "BeyondTrust PAM", "DigiCert CertCentral", "Microsoft Defender for Identity", "SAP GRC Access Control", "HashiCorp Vault", "Splunk SIEM", "Okta SSO"
- **/peer-analysis** (6): "bot-terraform-65", "Abdullah Al-Zahrani", "Dalal Al-Qahtani", "Youssef Al-Dosari", "msi-teams-11", "Saad Al-Malki"
- **/shadow-admins** (15): "Reem Al-Malki", "Amira Al-Harbi", "Amira Al-Otaibi", "Abdulaziz Al-Yami", "Dalal Al-Qahtani", "app-grafana-prod", "Youssef Al-Dosari", "Bandar Al-Shahrani", "Fahad Al-Qahtani", "Saad Al-Harbi", "Youssef Al-Shammari", "Reem Al-Shahrani", "Huda Al-Yami", "msi-grafana-14", "Ibrahim Al-Rashidi"
- **/supply-chain** (20): "Layla Al-Juhani", "Bandar Al-Harbi", "Ibrahim Al-Anazi", "Sultan Al-Malki", "Maha Al-Zahrani", "Fatima Al-Shammari", "Hamad Al-Subaie", "Noura Al-Rashidi", "Reem Al-Shammari", "Abdulaziz Al-Yami", "Huda Al-Yami", "Saad Al-Anazi", "Fahad Al-Mutairi", "Abdullah Al-Shammari", "Saud Al-Yami", …
- **/identities/:id** (1): "app-grafana-prod"
- **/attack-paths/:id** (2): "Youssef Al-ShammariDC-DR", "1Youssef Al-ShammariDC-DREntitlement"
- **/gpo/:id** (1): "Default Domain Controllers Policy"

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
| `PUT /api/automation-rules/[id]` | 403 | 403 | **400** | **400** | **400** |
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
| `POST /api/gpo` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/gpo/scan` | skip | skip | skip | skip | skip |
| `POST /api/graph/simulate` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/import/csv` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/import/csv-detect` | **400** | **400** | **400** | **400** | **400** |
| `POST /api/import/demo` | skip | skip | skip | skip | skip |
| `PATCH /api/integrations/[id]` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/integrations` | 403 | 403 | **400** | **400** | **400** |
| `POST /api/integrations/test` | 403 | 403 | **400** | **400** | **400** |
| `PATCH /api/issues/[fsid]` | 403 | **400** | **400** | **400** | **400** |
| `PATCH /api/notifications/[id]` | **404** | **404** | **404** | **404** | **404** |
| `POST /api/notifications/mark-all-read` | skip | skip | skip | skip | skip |
| `POST /api/notifications` | 403 | 403 | 403 | 403 | **400** |
| `PATCH /api/peer-anomalies/[id]` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/peer-groups` | skip | skip | skip | skip | skip |
| `PUT /api/remediation/[id]` | 403 | 403 | 403 | **400** | **400** |
| `POST /api/remediation` | 403 | **400** | **400** | **400** | **400** |
| `POST /api/reports/generate` | **400** | **400** | **400** | **400** | **400** |
| `POST /api/settings/api-keys` | 403 | 403 | 403 | 403 | **400** |
| `DELETE /api/settings/api-keys` | 403 | 403 | 403 | 403 | **400** |
| `PUT /api/settings/preferences` | **200** | **200** | **200** | **200** | **200** |
| `DELETE /api/settings/sessions/[id]` | **404** | **404** | **404** | **404** | **404** |
| `POST /api/settings/team` | 403 | 403 | 403 | 403 | **400** |
| `DELETE /api/settings/team` | 403 | 403 | 403 | 403 | **400** |
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

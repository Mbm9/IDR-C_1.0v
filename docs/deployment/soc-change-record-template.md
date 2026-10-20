# SOC / Blue-Team Change Record — Identity Radar Deployment

> **Purpose:** hand this to your SOC / security operations team **before the first Active
> Directory scan**. Identity Radar performs read-only AD posture assessment that *looks like*
> reconnaissance to detection controls (see [Hardened Environment guide](./hardened-environment.md)).
> This record declares the sanctioned activity so the SOC can attribute alerts and apply scoped
> allowlisting instead of triggering incident response or automated containment.
>
> Fill in every `<…>` field. Delete this quote block before submitting. Keep the signed copy for
> your audit trail (SAMA CSF / NCA ECC expect an authorization trail for a tool that performs
> directory reconnaissance and holds a directory service account).

---

## 1. Summary

| Field | Value |
|---|---|
| Change title | Deploy Identity Radar (ISPM/ITDR) — read-only AD assessment |
| Requested by | `<name / team>` |
| Business owner | `<name / role>` |
| Change ticket # | `<CHG-…>` |
| Requested go-live | `<date>` |
| Classification | Internal security tooling — read-only directory collection |
| Rollback | `docker compose -f deploy/docker/docker-compose.prod.yml stop app` (stops all scanning immediately) |

## 2. Source system (the Identity Radar host)

| Field | Value |
|---|---|
| Hostname | `<idr-host.corp.local>` |
| Fixed IP | `<10.x.x.x>` |
| OS / platform | Linux + Docker (containers: app, db, caddy) |
| App process | `node server.js` (non-root user `nextjs:nodejs`) |
| Container image digest(s) | `<sha256:…>` |
| Admin UI | HTTPS 443, restricted to mgmt network `<mgmt-cidr>` |

## 3. Directory service account (least privilege)

| Field | Value |
|---|---|
| Account (sAMAccountName / UPN) | `<svc-identityradar>` |
| Rights | **Read-only.** No privileged group membership; no write; no replication (DCSync) |
| Tier | Standard user (Tier 2) |
| Auth protocol | **LDAPS (636)** preferred / `<389 only if LDAPS unavailable>` |
| Credential storage | Encrypted at rest (`CREDENTIALS_KEY` set) |
| Password rotation | `<policy / interval>` |
| Auditing enabled? | `<yes — account logon auditing>` |

## 4. Destinations & network

| Source | Destination | Port/Proto | Purpose |
|---|---|---|---|
| `<idr-host IP>` | `<DC1, DC2 …>` | 636/TCP (LDAPS) | AD attribute read |
| `<mgmt-cidr>` | `<idr-host IP>` | 443/TCP | Admin UI |
| `<idr-host IP>` | Internet | — | **DENIED** (air-gapped / no egress) |

## 5. Activity & schedule

| Field | Value |
|---|---|
| What it reads | LDAP attributes: `servicePrincipalName`, `userAccountControl`, `adminCount`, `msDS-AllowedToDelegateTo`, `msDS-AllowedToActOnBehalfOfOtherIdentity`, `msDS-SupportedEncryptionTypes`, `memberOf`, `pwdLastSet`, `lastLogon`, `manager` |
| What it does NOT do | No writes. No SYSVOL/GPP access. No ADCS enrolment. No credential access. |
| Scan cadence | `<default: exposure/tier/attack-path scanners every 6h>` — staggered to avoid volume spikes |
| Scan trigger auth | Scanner endpoints require `Authorization: Bearer <CRON_SECRET>` (fail-closed) |
| First (coordinated) sync | `<date / time, with SOC watching>` |

## 6. Expected detections (please allowlist — scoped, do NOT disable globally)

| Activity | MITRE | Expected alert (control) | Requested action |
|---|---|---|---|
| Bulk LDAP attribute pull | T1087 / T1069 | "Security principal reconnaissance (LDAP)", "Suspicious LDAP queries" (**Defender for Identity**) | Scope exception to svc account + IDR IP |
| Reading SPNs across domain | T1558.003 | Kerberoast-precursor heuristics (MDI/MDE) | Scope exception to svc account |
| LDAP bind from Linux host | T1078 | Unusual auth source / new svc-account logon | Baseline as known source |
| Node process → 389/636 to DCs | — | Network IOA (**MDE / Carbon Black / CrowdStrike**) | Allow scoped to IDR host + process |
| Container runtime / image | — | Image & process control (**Carbon Black / CrowdStrike**) | Approve image digest(s) |

> Requested exception model: **scoped to the IDR host IP and the service account only.** Real
> reconnaissance from any other source must continue to alert.

## 7. Approvals

| Role | Name | Decision | Date |
|---|---|---|---|
| Requestor | `<…>` | | |
| SOC / Blue Team lead | `<…>` | `<approve / conditions>` | |
| AD / Identity team | `<…>` | `<approve>` | |
| Change Advisory Board | `<…>` | `<approve>` | |

## 8. Post-deployment validation (record after first sync)

- [ ] First sync run **with SOC watching the console**.
- [ ] Alerts fired matched section 6 (no unexpected detections).
- [ ] Alerts attributed to IDR host/account and covered by scoped exceptions.
- [ ] **No automated containment** triggered on host or service account.
- [ ] Scheduled cadence enabled after a clean run.
- [ ] Validated baseline recorded in `<change/SIEM system>`.
- [ ] Re-validation required after: IDR upgrade, IP change, or new collectors (e.g. live ADCS/SYSVOL).

Validated by: `<name>`  Date: `<date>`

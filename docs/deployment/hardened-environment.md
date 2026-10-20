# Deploying Identity Radar in a High-Enforcement Environment (EDR/XDR)

> For environments running endpoint/identity security controls — **Microsoft Defender
> for Endpoint (MDE)**, **Microsoft Defender for Identity (MDI)**, **VMware Carbon Black**,
> **CrowdStrike Falcon**, and similar.
>
> **Read this before you install.** Identity Radar's AD assessment reads the same directory
> attributes that attacker tools (SharpHound/BloodHound, Rubeus, PingCastle) read. To your
> security stack it *looks like* reconnaissance. The goal of this guide is **coordination and
> allowlisting of a sanctioned tool** — not evasion. Deploying it silently will generate SOC
> alerts and may trigger automated containment of the host or the service account.

---

## 1. Why this needs coordination

Identity Radar's scanners (the `/api/cron/*` jobs) perform **legitimate, read-only** collection.
But the *behaviour* overlaps with well-known attacker TTPs, so detection controls will react.

### What the platform actually does (live MVP surface)

The Active Directory connector ([`src/lib/connectors/ldap.ts`](../../src/lib/connectors/ldap.ts)) issues LDAP
queries that pull these attributes for every account:

| Attribute pulled | Why the tool needs it | What it looks like to an EDR/XDR |
|---|---|---|
| `servicePrincipalName` | Kerberoastable-account detection | **SharpHound / Kerberoast recon** |
| `userAccountControl` | AS-REP roasting, delegation, disabled/pwd flags | Account-enumeration |
| `adminCount` | Stale privileged / AdminSDHolder detection | Privileged-account enumeration |
| `msDS-AllowedToDelegateTo`, `msDS-AllowedToActOnBehalfOfOtherIdentity` | Constrained / RBCD delegation | Delegation abuse recon |
| `msDS-SupportedEncryptionTypes` | Weak-encryption / RC4 detection | Kerberos downgrade recon |
| `memberOf`, `pwdLastSet`, `lastLogon`, `manager` | Tiering, dormancy, risk scoring | Bulk directory enumeration |

Mapped to detections you should expect:

| Activity | MITRE | Likely detection |
|---|---|---|
| Bulk LDAP attribute pull | T1087 (Account Discovery), T1069 (Group Discovery) | **MDI: "Security principal reconnaissance (LDAP)"**, "Suspicious LDAP queries" |
| Reading SPNs across the domain | T1558.003 (Kerberoasting) | MDI/MDE Kerberoast-precursor heuristics |
| LDAP bind from a **Linux** container | T1078 | Unusual authentication source / new service-account logon pattern |
| Node.js process opening 389/636 to DCs | — | MDE/CB/CrowdStrike network-IOA on the app host |
| Container runtime + image pulls | — | CB/CrowdStrike image & process allowlisting |

> **ADCS (ESC1–ESC8) and SYSVOL/GPP secret findings are demo-only in the MVP** — they are
> produced by the seed data, *not* collected from your environment. So the live network/recon
> surface is **LDAP to your Domain Controllers only** (plus the local database and, optionally,
> a local Ollama). No SYSVOL share access, no ADCS enrolment traffic is generated yet.

---

## 2. Pre-deployment: security-team sign-off (do this first)

Give your SOC / blue team a one-page change record **before** the first scan:

- [ ] **Purpose**: sanctioned ISPM/ITDR tool performing read-only AD posture assessment.
- [ ] **Source host**: hostname + fixed IP of the Identity Radar server.
- [ ] **Service account**: the dedicated read-only AD account it will bind as (see §4).
- [ ] **Destinations & ports**: Domain Controllers on **636/TCP (LDAPS)** (preferred) or 389/TCP.
- [ ] **Schedule**: scan cadence (default: exposure/tier/attack-path scanners every 6h — see [`CLAUDE.md`](../../CLAUDE.md) cron list). Stagger to avoid volume spikes.
- [ ] **Expected detections**: the MDI/EDR alerts in §1 — request documented benign exceptions, **not** blanket disabling of the detections for the whole environment.
- [ ] **Owner / rollback**: who runs it, how to stop it (`docker compose … stop app`), incident contact.

Keep this record — banks under SAMA CSF / NCA ECC will want the authorization trail for a tool
that performs directory reconnaissance and holds a read-only directory service account.

---

## 3. Network & firewall

Least-privilege egress from the Identity Radar host:

```
ALLOW  <idr-host>  ->  <each DC>      tcp/636   (LDAPS — preferred)
ALLOW  <idr-host>  ->  <each DC>      tcp/389   (only if LDAPS unavailable; avoid)
ALLOW  <admin net> ->  <idr-host>     tcp/443   (Caddy UI)
DENY   <idr-host>  ->  internet       any       (air-gapped: no outbound)
```

- **Prefer LDAPS (636)**. Plain 389 sends the bind and query in cleartext and will itself be
  flagged by network controls; LDAPS both protects credentials and reduces noise.
- The database and Ollama stay on the internal Docker network (`deploy/docker/docker-compose.prod.yml`
  `networks: internal`) — no host exposure.
- Give the SOC the **exact source IP** so LDAP-recon alerts can be attributed to the tool, not an attacker.

---

## 4. Service account (least privilege)

- Dedicated account, used **only** by Identity Radar. Never reuse an admin or sync account.
- **Read-only.** Standard authenticated users can already read most of the attributes above;
  do **not** grant it any privileged group membership, write, or replication (DCSync) rights.
- Not a member of Tier 0 / privileged groups. It should appear in the tool's *own* Tier 2.
- **gMSA note:** group-managed service accounts can't authenticate from a non-domain-joined
  Linux container. Use a standard service account with a strong, rotated password over **LDAPS**,
  stored encrypted (set `CREDENTIALS_KEY` — see below).
- Enable auditing on this account so the SOC can baseline its (predictable, scheduled) behaviour.

---

## 5. Per-control allowlisting

> Use **scoped, documented exceptions** for the Identity Radar source host / service account —
> never disable a detection category globally. Product menus change; the concepts below are stable.
> Confirm exact steps against your platform's current admin docs.

### Microsoft Defender for Identity (MDI)
- Expect **"Security principal reconnaissance (LDAP)"** and **"Suspicious LDAP queries"** on the
  service account from the IDR host.
- Add the **service account** and the **IDR source IP** to the relevant MDI exclusions for those
  detections. Keep the exclusion scoped to that account/IP so real recon elsewhere still alerts.
- Tune scan cadence (§2) so you don't cross volume thresholds that other heuristics use.

### Microsoft Defender for Endpoint (MDE) — if deployed on the IDR Linux host or the DCs
- The IDR process is `node server.js` inside a container. Create a **custom indicator / allow**
  for the container image hash and, if needed, an **exclusion** for the app's process making
  outbound 636 — set to **allow/audit, not block/remediate**, so it isn't auto-contained.
- Do **not** exclude the whole `/var/lib/docker` tree from detection; scope to the IDR image.

### VMware Carbon Black (App Control / EDR)
- Add the container **image digests** and the node runtime to an **approval / allowlist** so the
  app isn't quarantined on first run.
- Create a **bypass/allow** for the LDAP-querying process's outbound network op; keep telemetry on.
- If real-time file scanning causes I/O contention with the container, scope a **performance
  exclusion** to the container storage path (keep detection elsewhere).

### CrowdStrike Falcon
- Add an **ML/IOA exception** scoped to the IDR host for the process performing LDAP enumeration,
  so behavioural detections don't block the scheduled scans.
- Use **host groups / sensor tags** to scope the exception to the IDR server only.

### Generic (any host AV/EDR on the Docker host)
- Allow the container images by hash; keep the container running as the non-root `nextjs:nodejs`
  user (already the default in [`deploy/docker/Dockerfile`](../../docker/Dockerfile)).
- Exclude only the specific container image/paths needed for performance — never the whole engine.

---

## 6. Host & container hardening (EDR-compatible)

The shipped config is already hardened; keep it that way:

- **Non-root**: the app runs as `nextjs:nodejs` (Dockerfile). Do not run the container as root.
- **No host networking**: services communicate over the compose `internal` bridge only.
- **Resource limits**: CPU/memory limits are set per service in `docker-compose.prod.yml`
  (also prevents a runaway scan from looking like resource-exhaustion malware).
- **Secrets**:
  - Set **`CREDENTIALS_KEY`** (32-byte base64) so connector credentials — including the AD
    service-account password — are encrypted at rest, not stored plaintext.
  - Set **`CRON_SECRET`** (required in production): the scanner endpoints **fail closed** without
    it, so no one can trigger LDAP scans anonymously. Your scheduler must send
    `Authorization: Bearer $CRON_SECRET`.
  - Real `.env` files are git-ignored; only `*.example` templates are committed.
- **AI stays local or off**: leave `ANTHROPIC_API_KEY` unset (no cloud egress). Use local Ollama
  or `AI_PROVIDER=none`.
- **TLS**: Caddy terminates HTTPS; restrict the admin UI to a management network (§3).

---

## 7. Installation steps

Follow the standard manual Linux install (see [`getting-started/install-linux.md`](../getting-started/install-linux.md)),
with these hardened-environment additions:

```bash
# 1. On the approved IDR host (Docker + compose plugin already installed):
git clone -b feat/ad-exposures-mvp https://github.com/ASHS21/IDR-C.git
cd IDR-C

# 2. Configure — set the SECURITY-critical vars:
cp .env.production.example .env
openssl rand -base64 32   # -> NEXTAUTH_SECRET
openssl rand -base64 32   # -> CRON_SECRET
openssl rand -hex 32      # -> CREDENTIALS_KEY   (MUST be 64 hex chars = 32 bytes)
nano .env                 # set POSTGRES_PASSWORD, DOMAIN, URLs, the 3 secrets above

# 3. Build & start (db + app + caddy):
docker compose -f deploy/docker/docker-compose.prod.yml up -d --build

# 4. Create the schema (compose does not migrate automatically):
docker exec idr-app npx drizzle-kit push
docker exec idr-app sh -c 'cat db/migrations/0001_create_views.sql | PGPASSWORD=$POSTGRES_PASSWORD psql -h db -U postgres -d identity_radar'

# 5. DO NOT run the seed on a real deployment (it loads fake demo identities + a demo admin).
#    Create your real admin user instead, then configure the AD connector in the UI.
```

> **Air-gapped host?** Build the image in a connected staging enclave, then transfer it with
> `deploy/scripts/bundle-offline.sh`. The IDR host itself needs no internet.

---

## 8. Post-install validation (with the SOC)

Run the **first AD sync as a coordinated event** with the SOC watching:

1. In **Integrations**, add the Active Directory (LDAP) connector — LDAPS, the read-only service
   account, one DC. Click **Test** (now `iam_admin`-gated; the endpoint blocks loopback/link-local
   targets via the SSRF guard).
2. Trigger one scan and **watch the SOC console together**. Confirm:
   - the alerts that fire match the expected list (§1),
   - they're attributed to the IDR host/account and covered by the scoped exceptions,
   - no automated containment triggers.
3. Tune exceptions until a scheduled scan runs clean, then enable the cron cadence.
4. Record the validated baseline in your change system.

---

## 9. Ongoing operations

- **Re-validate after upgrades** — new detection logic (or new IDR collectors, e.g. live ADCS/SYSVOL
  when added) changes the recon signature; repeat §8.
- **Rotate** the service-account password and `CRON_SECRET`/`CREDENTIALS_KEY` per policy.
- **Monitor** the tool's own audit log (immutable `action_log`) and ship it to your SIEM (Splunk).
- **Keep the exceptions scoped** to the IDR host/account. If the IDR host IP changes, update every
  control's exception — otherwise scans break (or, worse, the exception now covers the wrong host).

---

### Summary
Identity Radar is safe to run alongside Defender, Carbon Black, and CrowdStrike — provided the AD
assessment is **declared, attributed to a known host + least-privilege service account, and
allowlisted with scoped exceptions**. Treat the first sync as a joint exercise with the SOC. Never
respond to its recon-like alerts by weakening detections environment-wide.

# Identity Radar — Project Reference

> **What this file is**: The single source of truth for the Identity Radar codebase.
> Updated 2026-03-29 to match the actual implementation.

## System Identity
Identity Radar is an AI-powered Identity Security Posture Management (ISPM) platform with Identity Threat Detection & Response (ITDR) capabilities. It runs fully air-gapped with local AI (Ollama), provides unified visibility across human and non-human identities, enforces Active Directory tiering compliance, and supports 14 enterprise integration connectors.

Target market: CISOs, IAM Engineers, and Security Analysts in Saudi Arabia under NCA ECC, SAMA CSF, and PDPL frameworks.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) | Dashboard UI, SSR |
| Styling | Tailwind CSS 4 | Design system |
| Database | PostgreSQL 16 + Drizzle ORM | Data layer + migrations |
| Auth | NextAuth.js v5 | Session management + RBAC |
| AI | Ollama (local, primary) / Anthropic (fallback) | Risk analysis, CSV detection, chat |
| Validation | Zod | All boundary schemas |
| State | TanStack React Query | Server state |
| Charts | Recharts + D3.js | Visualizations + graph |
| i18n | next-intl | Arabic/RTL + English |
| Icons | Lucide React | Icon library |
| Containers | Docker Compose | PostgreSQL + Caddy |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AI LAYER                                                    │
│  Risk scoring, remediation plans, CSV detection, chat       │
│  Engine: Ollama (qwen2.5) / Anthropic API (fallback)       │
├─────────────────────────────────────────────────────────────┤
│  ACTION LAYER                                                │
│  API routes, cron jobs, kinetic actions, sync engine        │
│  Engine: Next.js API Routes + Node cron                     │
├─────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                  │
│  Identity objects, AD tiering, entitlements, policies       │
│  Engine: PostgreSQL 16 + Drizzle ORM                        │
└─────────────────────────────────────────────────────────────┘
```

## Key Numbers

| Metric | Count |
|--------|-------|
| Dashboard pages | 33 |
| API routes | 110 |
| Database tables | 40 |
| Cron jobs | 16 |
| AI prompts | 11 |
| Connectors | 14 |
| Components | 42 |
| Source lines | ~43,000 |
| i18n keys | ~1,570 (EN + AR) |

## Core Principle: Identity-First

ONE `identities` table for all identity types — human and non-human. Type discriminator (`human` | `non_human`) with sub-types (employee, contractor, service_account, managed_identity, etc.). Every other table links to `identities` via foreign keys.

## AD Tiering Model (First-Class)

| Tier | Scope | Risk |
|------|-------|------|
| Tier 0 | Domain Controllers, AD DS, Schema/Enterprise/Domain Admins | CRITICAL |
| Top Tier | Tier 0 adjacent: ADFS, Entra Connect, PKI/CA, PAM vaults, DC backup, Backup Operators | CRITICAL |
| Tier 1 | Member servers, app servers, Server Operators | HIGH |
| Tier 2 | Workstations, standard users, helpdesk | STANDARD |

Tier violation = identity's `effective_tier` (highest tier accessed) is stricter than its `ad_tier` (assigned tier).

Order (most privileged first): `tier_0` > `tier_top` > `tier_1` > `tier_2` > `unclassified`. Compare tiers with the helpers in `lib/utils/tiers.ts` (`tierRank`, `isStricterTier`), never by string order.

## Database Schema (26 tables)

**Core**: organizations, identities, accounts, groups, group_memberships, resources, entitlements, policies, violations
**Security**: ad_delegations, acl_entries, attack_paths, shadow_admins, identity_threats, identity_events, detection_rules, canary_identities, gpo (3 tables), peer_groups, peer_anomalies
**Operations**: integration_sources, action_log, remediation_plans, notifications, chat_sessions, identity_aliases
**Auth**: users, auth_accounts, sessions, subscriptions, invitations, api_keys

## Connectors (14)

| Connector | Category | Auth Method |
|-----------|----------|-------------|
| Active Directory (LDAP + CSV) | Directory | LDAP bind / CSV upload |
| Azure AD / Entra ID | Directory | OAuth2 client credentials |
| Okta | SSO | API token |
| SailPoint IdentityIQ | IGA | Basic auth / SCIM |
| Broadcom SiteMinder SSO | SSO | Admin API |
| Broadcom PAM | PAM | API user + key |
| ServiceNow | ITSM | Basic auth / OAuth2 |
| Microsoft Defender for Identity | ITDR | OAuth2 |
| SAP GRC / SAP IdM | IGA | OData / OAuth2 |
| HashiCorp Vault | Secrets | Token / AppRole |
| Splunk SIEM | SIEM | Basic auth / Bearer token |
| BeyondTrust PAM | PAM | API key + RunAs |
| DigiCert CertCentral | Certificate | API key |
| CSV Import | Manual | File upload |

## Cron Jobs (16)

Run by the `scheduler` container (`docker/scheduler.mjs`, app image) in both compose files: it calls `/api/cron/*` with `CRON_SECRET`; times in `SCHEDULE_TZ` (default UTC). A unit test checks every cron route is scheduled.


risk-scorer (6h), tier-scanner (6h), dormancy-detector (daily), cert-expiry (daily), nhi-orphan (daily), sync-health (15min), attack-path-scanner (6h), threat-detector (5min), event-cleanup (daily), shadow-admin-scanner (daily), peer-anomaly-detector (daily), supply-chain-risk (weekly), data-steward (daily), automation-engine, daily-briefing, ad-exposure-scanner (6h — static AD posture/exposure assessment via `lib/itdr/posture-checks.ts`)

## AI Prompts (11)

SYSTEM_PROMPT, ATTACK_PATH_NARRATION_PROMPT, THREAT_TRIAGE_PROMPT, PEER_ANOMALY_PROMPT, SUPPLY_CHAIN_PROMPT, BLAST_RADIUS_PROMPT, CHAT_SYSTEM_PROMPT, SMART_CSV_PARSER_PROMPT, IDENTITY_CLASSIFIER, DATA_STEWARD, CONFLICT_RESOLVER

## RBAC

| Role | Permissions |
|------|------------|
| viewer | Read-only all dashboards |
| analyst | + acknowledge violations, trigger reviews |
| iam_admin | + certify, revoke, update tiers, manage integrations |
| ciso | + approve exceptions, approve AI plans, manage policies |
| admin | + org settings, user management, branding (logo + display name, Settings → Organization) |

Enforced at: API route middleware (role checks) + UI conditional rendering.

## Coding Principles

1. Every mutation → action type → action_log entry (immutable audit trail)
2. Every action type has a Zod schema (validate at boundary)
3. AI never writes directly to DB (produces recommendations, humans approve)
4. Tier classification is first-class (every identity, group, resource has a tier)
5. Human and NHI share one table (discriminator pattern)
6. Server components by default (client only when interactivity requires it)
7. All colors via CSS variables (dark mode + light mode)
8. RTL-aware layout (logical properties: start/end, not left/right)

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/identity_radar

# Auth
NEXTAUTH_SECRET=<random-base64-32>
NEXTAUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true  # Required when behind reverse proxy

# AI (choose one)
AI_PROVIDER=ollama          # or "anthropic" or "none"
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b  # or qwen2.5:7b for better quality
ANTHROPIC_API_KEY=           # only if AI_PROVIDER=anthropic

# Security
CRON_SECRET=<random>          # Bearer token the external scheduler sends to /api/cron/*
CREDENTIALS_KEY=<64 hex>      # AES-256-GCM key for connector credentials; required to save credentials in production
# RATE_LIMIT_API_PER_MIN=300  # per user (per IP when anonymous); AUTH=30 per IP for credential POSTs; AI=5 per user
# APP_BIND_ADDRESS=127.0.0.1  # docker-compose: host interface for port 3000 (remote clients go through Caddy)

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEMO_MODE=false  # true shows demo credentials on login page

# Domain (production only, for Caddy HTTPS)
DOMAIN=localhost
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push Drizzle schema to PostgreSQL |
| `npm run db:seed` | Seed sample data (200 identities, groups, violations) |
| `scripts/setup.sh` | First-time local setup |
| `scripts/docker-up.sh` | Build + start full Docker stack, wait until healthy (Windows Git Bash/WSL friendly); `--no-demo` for an empty database |
| `scripts/doctor.sh` | Read-only diagnosis of the Docker deployment with suggested fixes |
| `scripts/deploy.sh` | One-command production deployment |
| `scripts/backup.sh` | On-demand database backup with rotation (the `backup` container also writes one daily) |
| `scripts/restore.sh` | Database restore from backup |
| `scripts/bundle-offline.sh` | Create offline deployment package |

## Deployment

**Local dev**: `docker compose up -d && npm run dev`
**Production**: `./scripts/deploy.sh --domain radar.example.com` (no demo data; secrets kept across re-runs; scheduler + daily backups)
**Offline**: `./scripts/bundle-offline.sh` → copy to USB → `./install.sh`

## Testing

- Framework: Vitest (unit/integration) + Playwright (E2E)
- Run: `npm test` (unit) / `npm run test:e2e` (E2E)
- 415 unit/integration tests, 45 E2E tests (E2E needs the uat.<role> users: tests/uat/create-role-users.sql)

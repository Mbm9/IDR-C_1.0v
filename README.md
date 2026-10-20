# Identity Radar

**AI-powered Identity Security Posture Management. Runs air-gapped. No cloud. No API keys.**

<!-- TODO: Replace with actual screenshot -->
<!-- ![Identity Radar Dashboard](docs/assets/screenshot-dashboard.png) -->

---

## Features

- **Identity Security Posture Management (ISPM)** -- Continuous assessment of identity risks across human and non-human identities with an 11-factor risk scoring engine
- **Active Directory Tiering Enforcement** -- First-class three-tier model (Tier 0/1/2) with automated violation detection and cross-tier access path analysis
- **Identity Threat Detection and Response (ITDR)** -- Real-time detection of credential attacks including Kerberoasting, DCSync, golden ticket, impossible travel, and password spray
- **Air-Gapped AI Analysis** -- Local AI model runs entirely on your infrastructure with no external API calls, internet access, or cloud dependencies
- **Attack Path Discovery** -- Automated privilege escalation path analysis from standard users to Domain Admin with MITRE ATT&CK mapping
- **Shadow Admin Detection** -- Five detection methods (ACL analysis, delegation chains, nested groups, service ownership, GPO rights) to find hidden admin-equivalent access
- **Non-Human Identity Governance** -- Complete lifecycle management for service accounts, managed identities, API keys, and bot accounts with ownership tracking and expiry monitoring
- **Saudi Regulatory Compliance** -- Built-in mapping to NCA ECC, SAMA CSF, and PDPL frameworks with automated audit evidence collection

## Quick Start

### Windows (Docker Desktop)

Follow **[INSTALL-WINDOWS.md](./INSTALL-WINDOWS.md)**: six short steps, about 15 minutes.

### Linux / macOS (Docker)

```bash
git clone https://github.com/Mbm9/IDR-C_1.0v.git
cd IDR-C_1.0v
./deploy/scripts/docker-up.sh --no-caddy
# Open http://localhost:3000
```

Sign in as `admin@acmefs.sa` with the password the script prints (also in `.env` as `SEED_ADMIN_PASSWORD`).

### Production server

```bash
./deploy/scripts/deploy.sh --domain radar.example.com
```

## Project Layout

```
app/  components/  lib/      Next.js application (App Router, UI, business logic)
i18n/  messages/  public/    Translations (EN/AR) and static assets
drizzle/  seed/              Database migrations and demo seed data
deploy/                      Dockerfile, compose files, deploy/backup scripts, Windows installer
tests/                       Unit, integration, E2E and UAT tests (+ UAT reports)
tools/                       One-off developer/data scripts
docs/                        Product, admin, deployment and architecture documentation
docker-compose.yml           Local / demo stack (`docker compose up`)
INSTALL-WINDOWS.md           Simple Windows install guide
```

See [deploy/README.md](./deploy/README.md) and [tests/README.md](./tests/README.md) for what each file does.

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 16 GB | 32 GB |
| CPU | 4 cores | 8 cores |
| Disk | 50 GB | 100 GB SSD |
| OS | Windows 10 21H2+, Ubuntu 22.04+, macOS 13+ | |
| Docker | Docker Desktop 4.40+ | |

## Architecture

```
+-------------------------------------------------------------+
|  LAYER 03 -- DYNAMIC (Decisions & Learning)                  |
|  AI risk scoring, remediation plans, anomaly detection,      |
|  attack path narratives, posture simulation                  |
|  Engine: Local AI (Docker Model Runner) or Anthropic API     |
+-------------------------------------------------------------+
|  LAYER 02 -- KINETIC (Actions & Automation)                  |
|  Access reviews, provisioning workflows, policy enforcement, |
|  certification campaigns, escalations, audit logging         |
|  Engine: Next.js API Routes + Cron Workers                   |
+-------------------------------------------------------------+
|  LAYER 01 -- SEMANTIC (Ontology Core)                        |
|  Identity objects, AD tiering model, entitlements,           |
|  group memberships, roles, resources, policies               |
|  Engine: PostgreSQL + Drizzle ORM + NextAuth.js              |
+-------------------------------------------------------------+
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) | Dashboard UI, SSR pages |
| Styling | Tailwind CSS 4 | Design system |
| Database | PostgreSQL 16 + Drizzle ORM | Semantic layer store |
| Auth | NextAuth.js v5 | Session management + RBAC |
| AI | Docker Model Runner / Anthropic API | Dynamic layer reasoning |
| Validation | Zod | Boundary schemas |
| State | TanStack React Query | Server state management |
| Charts | Recharts + D3 | Dashboard visualizations |
| Infra | Docker Compose | Container orchestration |

## Documentation

Full documentation is available in the [`docs/`](./docs/README.md) directory:

- [Getting Started](./docs/getting-started/system-requirements.md) -- Requirements, first login, connecting data sources
- [Installation and Deployment](./docs/deployment/docker-windows.md) -- Docker on Windows, production, offline installs
- [User Guide](./docs/user-guide/dashboard-overview.md) -- Dashboard features and workflows
- [Admin Guide](./docs/admin-guide/user-management.md) -- User management, integrations, policies
- [Reference](./docs/reference/risk-scoring.md) -- Risk scoring formula, RBAC matrix, configuration
- [Compliance](./docs/compliance/nca-ecc.md) -- NCA ECC, SAMA CSF, PDPL mapping
- [FAQ](./docs/reference/faq.md) -- Common questions and answers

## License

[Apache-2.0](./LICENSE)

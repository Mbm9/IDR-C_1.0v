# Core Concepts

> Understanding Identity Radar's three-layer ontology architecture.

## Identity-First Architecture

Every entity in Identity Radar resolves to a single concept: **Identity**. An Identity can be:

- **Human Identity**: Employee, contractor, vendor, partner
- **Non-Human Identity (NHI)**: Service account, managed identity, app registration, API key, bot, machine

There is no separate "user" and "service account" table — there is one `identities` table with a `type` discriminator.

## Three-Layer Ontology

### Layer 1: Semantic (Data Core)
The foundation. All identity objects, AD tiering classifications, entitlements, group memberships, roles, resources, and policies live here. Powered by PostgreSQL with Drizzle ORM.

### Layer 2: Kinetic (Actions & Automation)
Every mutation to the ontology goes through a defined action type — certify, revoke, escalate, review, etc. Each action is validated, role-checked, and audit-logged.

### Layer 3: Dynamic (AI Decisions)
AI-powered risk scoring, remediation recommendations, anomaly detection, and posture simulation. The AI never writes directly to the database — it produces plans that humans approve.

## AD Tiering Model

| Tier | Scope | Risk Level |
|------|-------|------------|
| Tier 0 | Identity plane control (DCs, AD DS, Schema Admins) | CRITICAL |
| Top Tier | Tier 0 adjacent (ADFS, Entra Connect, PKI/CA, PAM vaults, DC backup) | CRITICAL |
| Tier 1 | Server & application control (member servers, service accounts) | HIGH |
| Tier 2 | Workstation & end-user (standard accounts, helpdesk) | STANDARD |

**Tiering violations** — a Tier 2 identity accessing Tier 0 resources — are the primary risk signal.

## Risk Scoring

Deterministic formula (0-100):
- Tier violation: 30 points
- Privilege level: 20 points
- Dormancy: 15 points
- Violation count: 15 points
- Missing MFA: 10 points
- Certification overdue: 5 points
- Orphaned NHI: 5 points

## RBAC Model

| Role | Permissions |
|------|------------|
| Viewer | Read-only access |
| Analyst | + acknowledge violations, trigger reviews |
| IAM Admin | + certify, revoke, update tiers, manage integrations |
| CISO | + approve exceptions, approve AI plans, manage policies |
| Admin | + org settings, user management |

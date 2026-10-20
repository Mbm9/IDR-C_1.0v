# Identity Radar Documentation

> Complete documentation for Identity Radar -- AI-powered Identity Security Posture Management.

- [Product Overview](./product-overview.md) -- What it is, what makes it stand out, and the full feature list

## Getting Started

1. [System Requirements](./getting-started/system-requirements.md) -- Hardware, software, and network requirements
2. [Install on Windows](./getting-started/install-windows.md) -- Windows installer walkthrough
3. [Install on Linux](./getting-started/install-linux.md) -- Docker Compose setup on Ubuntu/RHEL
4. [Air-Gapped Installation](./getting-started/install-airgap.md) -- Offline deployment via USB transfer
5. [First Login](./getting-started/first-login.md) -- Default credentials and onboarding wizard
6. [Connect Your First Data Source](./getting-started/connect-first-source.md) -- Azure AD and Active Directory setup
7. [CSV Import](./getting-started/csv-import.md) -- Import identities from CSV files
8. [Your First 15 Minutes](./getting-started/first-15-minutes.md) -- Guided walkthrough of key features

## Installation and Deployment

1. [Install on Windows with Docker](../INSTALL-WINDOWS.md) -- The short, step-by-step version
2. [Docker on Windows (full guide)](./deployment/docker-windows.md) -- Every option, diagnostics, and production notes
3. [Redeploy from a ZIP](./deployment/redeploy-from-zip.md) -- Update an install without Git
4. [Offline Laptop Setup](./getting-started/offline-laptop-setup.md) -- Demo laptop with no internet
5. [API Keys](./deployment/api-keys.md) -- Keys for the ingest API
6. [Hardened Environment (EDR/XDR)](./deployment/hardened-environment.md) -- Running alongside Defender, Carbon Black, CrowdStrike
7. [SOC Change-Record Template](./deployment/soc-change-record-template.md) -- Fill-in one-pager for blue-team sign-off

The deployment files themselves (Dockerfile, compose files, scripts, Windows installer) are in [`deploy/`](../deploy/README.md).

## Architecture

1. [Solution Architecture](./architecture/solution-architecture.md) -- Network placement, components, data flows, HA/DR, air-gap
2. [Service Architecture (ITIL 4)](./architecture/service-architecture-itil.md) -- Service catalogue, value chain, SLAs, incident/change/problem
3. [Architecture Definition Document (TOGAF ADM)](./architecture/togaf-architecture.md) -- Principles, target architectures, gap analysis, roadmap

## API

1. [API Overview](./api-reference/overview.md) -- Authentication, conventions, and endpoints

## User Guide

1. [Dashboard Overview](./user-guide/dashboard-overview.md) -- Metric cards, risk trend, tier compliance
2. [Identity Explorer](./user-guide/identities.md) -- Search, filter, and manage identities
3. [AD Tiering](./user-guide/tiering.md) -- Tier pyramid, violations, Tier 0 inventory
4. [Entitlement Radar](./user-guide/entitlements.md) -- Over-provisioned, toxic combinations, unused access
5. [Policy Violations](./user-guide/violations.md) -- Violation feed, exceptions, remediation tracking
6. [Non-Human Identities](./user-guide/nhi.md) -- Service accounts, managed identities, API keys
7. [Access Certifications](./user-guide/certifications.md) -- Certification campaigns and bulk review
8. [AI Analysis](./user-guide/ai-analysis.md) -- AI-powered risk analysis and remediation plans
9. [AI Chat](./user-guide/ai-chat.md) -- Natural language queries about your posture
10. [Attack Paths](./user-guide/attack-paths.md) -- Privilege escalation path discovery
11. [Audit Trail](./user-guide/audit-trail.md) -- Action log, filters, compliance export
12. [Search (Cmd+K)](./user-guide/search.md) -- Command palette and keyboard navigation
13. [Notifications](./user-guide/notifications.md) -- Alerts, bell icon, email preferences

## Admin Guide

1. [User Management](./admin-guide/user-management.md) -- Add users, assign roles, manage team
2. [Active Directory Integration](./admin-guide/integrations/active-directory.md) -- LDAP connection and CSV export
3. [Azure AD Integration](./admin-guide/integrations/azure-ad.md) -- Microsoft Graph API setup
4. [Okta Integration](./admin-guide/integrations/okta.md) -- Okta API token configuration
5. [CSV Import (Admin)](./admin-guide/integrations/csv-import.md) -- Supported formats and column specs
6. [Policies](./admin-guide/policies.md) -- Policy types, rule creation, thresholds
7. [Data Quality](./admin-guide/data-quality.md) -- Quality scoring, identity resolution, enrichment
8. [Backup and Restore](./admin-guide/backup-restore.md) -- Database backups and recovery
9. [Upgrade](./admin-guide/upgrade.md) -- Version upgrades and migration handling
10. [Troubleshooting](./admin-guide/troubleshooting.md) -- Common issues and solutions

## Reference

1. [System Requirements](./reference/system-requirements.md) -- Canonical requirements table
2. [Port Reference](./reference/ports.md) -- All network ports and firewall rules
3. [Configuration Reference](./reference/config-reference.md) -- Every `.env.local` variable
4. [RBAC Matrix](./reference/rbac-matrix.md) -- Full role-to-action permission matrix
5. [Risk Scoring](./reference/risk-scoring.md) -- 11-factor formula with weights and examples
6. [Tier Classification](./reference/tier-classification.md) -- Tier 0/1/2 definitions and rules
7. [CSV Formats](./reference/csv-formats.md) -- Column specs and sample data
8. [Keyboard Shortcuts](./reference/keyboard-shortcuts.md) -- Global and table shortcuts
9. [Glossary](./reference/glossary.md) -- IAM term definitions
10. [FAQ](./reference/faq.md) -- 25+ questions and answers

## Compliance

1. [NCA ECC](./compliance/nca-ecc.md) -- NCA Essential Cybersecurity Controls mapping
2. [SAMA CSF](./compliance/sama-csf.md) -- SAMA Cyber Security Framework mapping
3. [PDPL](./compliance/pdpl.md) -- Personal Data Protection Law compliance

## Test Reports

UAT runs, screenshots, and the defect register are kept with the tests in [`tests/uat/reports/`](../tests/uat/reports/).

# tests/

| Path | What it is | Run with |
|------|------------|----------|
| `unit/` | Vitest unit tests | `npm test` |
| `integration/` | Vitest API route tests (mocked database) | `npm test` |
| `e2e/` | Playwright browser tests against a running app | `npm run test:e2e` |
| `helpers/`, `setup.ts` | Shared mocks and Vitest setup | — |
| `.artifacts/` | Local Playwright output and cached sessions (git-ignored) | — |
| `uat/` | UAT crawl and RBAC probe scripts (`node tests/uat/crawl.mjs`) | see each script's header |
| `uat/reports/` | UAT plans, run reports, defect register, screenshots, crawl data | — |

Some E2E specs need the `uat.<role>` users from `uat/create-role-users.sql`; they skip when those are missing.

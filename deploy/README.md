# deploy/

Everything needed to build, run, and operate Identity Radar. Run every script from the
repository root, e.g. `./deploy/scripts/docker-up.sh`.

New to this? Start with [INSTALL-WINDOWS.md](../INSTALL-WINDOWS.md).

| Path | What it is |
|------|------------|
| `../docker-compose.yml` | Local / demo stack. Kept at the repository root so `docker compose up` works there |
| `docker/Dockerfile` | Multi-stage image build: `runner` (app + scheduler) and `init` (schema + seed) |
| `docker/docker-compose.prod.yml` | Production stack, used by `scripts/deploy.sh` and the offline bundle |
| `docker/init-db.sh` | Entry point of the one-shot `init` container (migrations, views, seed) |
| `docker/scheduler.mjs` | Calls the `/api/cron/*` scans on schedule (runs as the `scheduler` container) |
| `docker/backup-loop.sh` | Daily `pg_dump` loop for the `backup` container |
| `docker/Caddyfile` | HTTPS reverse proxy config |
| `scripts/docker-up.sh` | Build and start the local stack, then wait until it is healthy (Git Bash / WSL friendly) |
| `scripts/doctor.sh` | Read-only diagnosis of a Docker install, with a suggested fix per problem |
| `scripts/deploy.sh` | One-command production deployment |
| `scripts/backup.sh` / `scripts/restore.sh` | On-demand database backup / restore |
| `scripts/bundle-offline.sh` / `.ps1` | Build an offline (air-gapped) package, from Linux or Windows |
| `scripts/setup.sh` | First-time setup for local development (`npm run dev`) |
| `windows-installer/` | Inno Setup installer (`IdentityRadar-Setup.exe`) and its PowerShell scripts |

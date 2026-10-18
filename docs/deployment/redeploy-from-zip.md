# Redeploy the latest `main` on Windows (ZIP download)

Use this when you update an existing Docker install from a fresh ZIP of `main`.
It replaces the old containers with ones built from the new code, and keeps your
database, unless you choose to start over in step 5.

Run every command in **Git Bash**. Time needed: about 15 minutes, most of it the image build.

---

## 1. Save your current `.env`

Your `.env` holds the database password, the admin password and the key that
encrypts connector credentials (`CREDENTIALS_KEY`). A new folder without it gets
new secrets, and saved connector passwords can then no longer be decrypted.

```bash
cp /c/Users/User/Downloads/IDR-C_1.0v-main/IDR-C_1.0v-main/.env ~/idr-env-backup
```

Adjust the path if your old folder is elsewhere. The folder that holds `.env` also holds `docker-compose.yml`.

## 2. Stop and remove the old containers

This removes containers only. Your data lives in a separate Docker volume and is kept.

```bash
docker rm -f idr-app idr-init idr-caddy idr-ollama idr-db
```

"No such container" messages are fine.

## 3. Download and extract the new code

1. Download the latest ZIP of `main` from GitHub.
2. Extract it to a **new, clean folder**, for example `C:\IDR\IDR-C_1.0v-main`.
   Do not extract it inside the old folder; nested copies caused the stale build before.
3. Restore your saved `.env`:

```bash
cd /c/IDR/IDR-C_1.0v-main
cp ~/idr-env-backup .env
```

## 4. Build from scratch and start

```bash
./scripts/docker-up.sh --no-cache
```

`--no-cache` rebuilds every image, so nothing from the old build is reused.
Wait for the "healthy" message at the end.

## 5. Optional: start over with a clean database

Only do this if you want to wipe all data, including users and imported identities.

```bash
./scripts/docker-up.sh --reset
```

## 6. Check the deployment

```bash
./scripts/doctor.sh
```

Expected summary: **0 error(s), 0 warning(s)**.

If a `MISSING_MESSAGE` line or any other error appears, take a screenshot of the
doctor output and send it for a fix.

## 7. Log in

| | |
|---|---|
| URL | <http://localhost:3000>, or <https://localhost> through Caddy (self-signed certificate warning is expected) |
| Email | `admin@acmefs.sa` |
| Password | `SEED_ADMIN_PASSWORD` in `.env` |

The password from `.env` applies only when the database is first seeded. If you
kept your existing database, your existing password still works.

## 8. Confirm the latest features are present

- Sidebar shows **Reports**; open **Reports → GPO & Policy Validation**.
- **AD Tiering** shows five cards, including **Top Tier Identities**.
- Cards have a status dot beside the label instead of a coloured side stripe.

---

## Before production with real data

This setup (`docker-up.sh`) is for demo and pilot use: it loads the demo
organization (Acme Financial Services) into an empty database. For production:

1. Deploy with `./scripts/deploy.sh --domain radar.yourcompany.sa`. It loads no demo data unless you pass `--seed`.
2. Use strong, unique values in `.env` for `NEXTAUTH_SECRET`, `CRON_SECRET`, `CREDENTIALS_KEY` (64 hex characters), `POSTGRES_PASSWORD` and `SEED_ADMIN_PASSWORD`, and set `NEXT_PUBLIC_DEMO_MODE=false`.
3. Set up a scheduler to call the background scans (`/api/cron/*` with `CRON_SECRET`). The Docker setup does not include one yet, so dashboards only update when a scan is run by hand.
4. Schedule backups with `scripts/backup.sh`. See [Backup and restore](../admin-guide/backup-restore.md).

## Useful commands

| Task | Command |
|---|---|
| See running containers | `docker ps` |
| App logs | `docker logs --tail 200 idr-app` |
| Restart the app | `docker restart idr-app` |
| Stop everything | `docker compose down` |
| Full guide | [Deploy with Docker on Windows](docker-windows.md) |

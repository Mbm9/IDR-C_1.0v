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
docker rm -f idr-app idr-init idr-scheduler idr-backup idr-caddy idr-ollama idr-db
```

"No such container" messages are fine. (`idr-ollama` is from older versions; Ollama now runs on the host.)

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
./deploy/scripts/docker-up.sh --no-cache
```

`--no-cache` rebuilds every image, so nothing from the old build is reused.
Wait for the "healthy" message at the end.

To start without the Acme demo data (an empty database where the first account
created at `/signup` becomes the admin), use `./deploy/scripts/docker-up.sh --no-cache --no-demo`
instead. This only matters for an empty database; existing data is never changed.

## 5. Optional: start over with a clean database

Only do this if you want to wipe all data, including users and imported identities.
It also deletes the downloaded AI model, so the next start downloads it again.

```bash
./deploy/scripts/docker-up.sh --reset
```

## 6. Check the deployment

```bash
./deploy/scripts/doctor.sh
```

Expected summary: **0 error(s), 0 warning(s)**. The doctor also reports:

- **Scheduled scans running**: the `idr-scheduler` container runs the background scans.
  Right after a fresh start it may say no scan has finished yet; run the doctor again after a few minutes.
- **Latest backup**: the `idr-backup` container writes a daily dump to the `backups` folder.

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
- `docker ps` lists `idr-scheduler` and `idr-backup`.

---

## Before production with real data

`docker-up.sh` is for demo and pilot use. For a production server with real data,
use the production script on a Linux server (or WSL) with ports 80 and 443 open:

```bash
./deploy/scripts/deploy.sh --domain radar.yourcompany.sa
```

It does the following:

- Generates strong secrets on the first run (`.env.production`) and keeps them on later runs.
- Loads no demo data. Open `https://radar.yourcompany.sa/signup`; the first account becomes the organization admin.
- Starts the scheduler (background scans) and daily backups to `deploy/docker/backups/`.
- Gets an HTTPS certificate through Caddy (DNS for the domain must point at the server).

Re-run the same command to update to newer code; data and secrets are kept.
Keep a copy of `.env.production` somewhere safe. See [Backup and restore](../admin-guide/backup-restore.md) to restore a backup.

## Useful commands

| Task | Command |
|---|---|
| See running containers | `docker ps` |
| App logs | `docker logs --tail 200 idr-app` |
| Restart the app | `docker restart idr-app` |
| Stop everything | `docker compose down` |
| Full guide | [Deploy with Docker on Windows](docker-windows.md) |

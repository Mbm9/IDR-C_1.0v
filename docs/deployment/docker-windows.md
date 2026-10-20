# Deploy with Docker on Windows

Step-by-step guide for building and running the full Identity Radar stack on
Windows 10/11 or Windows Server with Docker Desktop. It uses two scripts:

| Script | Purpose |
|--------|---------|
| `deploy/scripts/docker-up.sh` | Pre-flight checks, creates `.env`, builds images, starts the stack, waits until healthy |
| `deploy/scripts/doctor.sh` | Read-only diagnosis: prints every problem it finds with a suggested fix |

The stack (`docker-compose.yml`):

| Container | Role | Port |
|-----------|------|------|
| `idr-db` | PostgreSQL 16 | 5432 (localhost only) |
| `idr-init` | One-shot: pushes the schema, creates views, seeds sample data, then exits | — |
| `idr-app` | Next.js application | 3000 (localhost only; set `APP_BIND_ADDRESS=0.0.0.0` in `.env` to expose it) |
| `idr-caddy` | HTTPS reverse proxy (optional) | 80 / 443 |

AI runs on **Ollama installed on the machine itself**, not in a container. Install it from
https://ollama.com/download and pull the model once (`ollama pull qwen2.5:1.5b`). The app
reaches it at `http://host.docker.internal:11434` (set `OLLAMA_URL` in `.env` to change that).
Without Ollama the app still runs; only the AI features are off.

---

## 1. Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Windows | 10 21H2 / 11 / Server 2022 | Windows 11 |
| Docker Desktop | 4.x with **WSL 2 backend** | latest |
| RAM given to Docker | 2 GB | 4 GB |
| Ollama (on the host) | installed, model pulled | `qwen2.5:7b` with 8 GB+ free RAM |
| Free disk | 20 GB | 50 GB |
| Shell | Git Bash (from Git for Windows) **or** WSL 2 (Ubuntu) | WSL 2 |

1. Install **Docker Desktop**: <https://docs.docker.com/desktop/setup/install/windows-install/>
   - Settings → General → enable **Use the WSL 2 based engine**.
   - It must run **Linux containers** (the default). If the tray menu shows
     "Switch to Linux containers…", click it.
2. Install **Git for Windows** (<https://git-scm.com/download/win>). It includes Git Bash and `curl`.
   *Or* install WSL (`wsl --install` in an admin PowerShell) and, in Docker
   Desktop, enable Settings → Resources → **WSL integration** for your distro.
3. Optional, more memory for Docker: create `%UserProfile%\.wslconfig`:

   ```ini
   [wsl2]
   memory=8GB
   processors=4
   ```

   Then run `wsl --shutdown` in PowerShell and restart Docker Desktop.

---

## 2. Get the code (keep LF line endings)

The scripts that run inside the containers must have Unix (LF) line endings.
The repository has a `.gitattributes` that enforces this. To be safe, also
turn off the CRLF conversion before you clone:

```bash
git config --global core.autocrlf input
```

**Git Bash** (use a path without spaces):

```bash
cd /c
git clone https://github.com/ASHS21/IDR-C.git
cd IDR-C
```

**WSL** (faster builds; clone into the Linux home folder, not `/mnt/c/...`):

```bash
cd ~
git clone https://github.com/ASHS21/IDR-C.git
cd IDR-C
```

> Already cloned with CRLF endings? `docker-up.sh` cannot fix itself: bash
> stops at its first line with `set: pipefail\r: invalid option name`. Convert
> the scripts once, then run it normally:
>
> ```bash
> sed -i 's/\r$//' deploy/scripts/*.sh deploy/docker/*.sh deploy/docker/Caddyfile
> ```
>
> To fix the checkout for good, commit or stash your changes first, then run
> `git config core.autocrlf input && git rm -r --cached -q . && git reset --hard`.
> The reset discards any uncommitted edits.

---

## 3. Build and start

Run this from Git Bash or WSL, in the project folder:

```bash
./deploy/scripts/docker-up.sh
```

What it does:

1. Checks that Docker is running, in Linux mode, with Compose v2.
2. Fixes CRLF line endings in the shell scripts.
3. Creates `.env` with random secrets if it doesn't exist yet (`POSTGRES_PASSWORD`,
   `NEXTAUTH_SECRET`, `CRON_SECRET`, `CREDENTIALS_KEY`, `SEED_ADMIN_PASSWORD`).
   It keeps an existing `.env`, only adding `NEXTAUTH_SECRET`, `CRON_SECRET` or
   `CREDENTIALS_KEY` when they are missing.
4. Validates the compose file, then builds the `init`, `app` and `scheduler` images (the scheduler reuses the app image).
5. Starts `db` and `init`, and shows the init logs if seeding fails. Init loads the Acme demo
   organization into an empty database unless you pass `--no-demo`.
6. Checks that Ollama is running on the host and has the model (pulls it with `ollama pull` if missing). Never fails the run: without Ollama only AI is off.
7. Starts `app`, `scheduler`, `backup` (and `caddy`), then waits for the app container's health check to pass.
   - `scheduler` runs the 16 background scans (`/api/cron/*`) on their schedule, and the six-hourly scans once at start.
   - `backup` writes a daily database dump to `./backups` and keeps the newest 14.
8. Checks that the app container can reach the host's Ollama, then prints the URL and the admin login.

The first run takes a while for the image build (~5–10 min). Later runs start in seconds.
There is no model download: the host's Ollama already has it.

### Options

| Flag | Effect |
|------|--------|
| `--no-caddy` | Don't start Caddy. Use this when ports 80/443 are taken (IIS, Skype, etc.) or you don't need HTTPS |
| `--model qwen2.5:7b` | Pick the Ollama model (saved to `.env`; pulled into the host Ollama if missing) |
| `--no-cache` | Rebuild the images from scratch |
| `--reset` | **Deletes all data** (database, certificates) before starting |
| `--no-demo` | Start with an empty database (no Acme demo data); create the first account at `/signup`. Saved to `.env` as `SEED_DEMO=false` |
| `--timeout 1200` | Seconds to wait for the app (default 600) |
| `--logs` | Follow the container logs after starting |

### PowerShell / CMD

The scripts are Bash. From PowerShell, run them through Git Bash or WSL:

```powershell
& "C:\Program Files\Git\bin\bash.exe" ./deploy/scripts/docker-up.sh
# or
wsl ./deploy/scripts/docker-up.sh
```

---

## 4. Log in

| | |
|---|---|
| URL | <http://localhost:3000> (or `https://localhost` through Caddy, which uses a self-signed certificate) |
| Email | `admin@acmefs.sa` |
| Password | the `SEED_ADMIN_PASSWORD` value in `.env` (printed at the end of `docker-up.sh`) |

The password only takes effect on the **first** seed. If the database already
had data, the existing password stays. Run `./deploy/scripts/docker-up.sh --reset` to re-seed.

---

## 5. Diagnose problems

```bash
./deploy/scripts/doctor.sh                  # full check
./deploy/scripts/doctor.sh --logs 300       # scan more log lines per container
./deploy/scripts/doctor.sh --report doctor.txt   # also save the output (attach it to support tickets)
```

It checks:

1. **Host & shell**: Git Bash vs WSL, required tools, a project path with spaces, a project on `/mnt/c` in WSL.
2. **Docker engine**: daemon running, Linux containers mode, WSL 2 backend, Compose v2, RAM, free disk.
3. **Project files**: required files present, CRLF line endings, `.env` present, placeholder or invalid secrets, `docker compose config` valid.
4. **Ports**: 3000, 5432, 80 and 443 free, or owned by our containers.
5. **Containers**: running/healthy state, init exit code, OOM kills, crash loops, and recent error lines from each container's logs.
6. **Services**: PostgreSQL accepting connections, schema tables, seeded orgs and users, Ollama running on the host with the model pulled and reachable from the app, `/api/health`, the login page, Caddy HTTPS.

The exit code is `0` when there are no errors (warnings are allowed) and `1` otherwise.

### Common problems

| Doctor message | Cause | Fix |
|----------------|-------|-----|
| `Docker daemon not reachable` | Docker Desktop isn't running, or WSL integration is off | Start Docker Desktop. In WSL, enable Settings → Resources → WSL integration |
| `Docker is in 'windows' container mode` | Windows containers selected | Tray icon → *Switch to Linux containers…* |
| `Windows (CRLF) line endings` / logs show `\r: not found` | Git converted line endings | `sed -i 's/\r$//' deploy/scripts/*.sh deploy/docker/*.sh deploy/docker/Caddyfile`, then see section 2 for the permanent fix |
| `required variable NEXTAUTH_SECRET is missing a value` | `.env` predates the generated secrets | Run `./deploy/scripts/docker-up.sh`, which adds the missing secrets, or add `NEXTAUTH_SECRET=$(openssl rand -hex 32)` to `.env` |
| `Port 5432 is already used` | A local PostgreSQL service is running | Stop it (`services.msc` → postgresql) or change the port mapping in `docker-compose.yml` (e.g. `"5433:5432"`) |
| `Port 80/443 is already used` | IIS / World Wide Web Publishing Service, or another proxy | Use `--no-caddy`, or stop the service: `net stop w3svc` (admin) |
| `Port 3000 is already used` | Another dev server | Find it with `netstat -ano \| findstr :3000` and end that PID in Task Manager |
| `killed by OOM` / low RAM error | Docker has too little memory | Raise `memory=` in `.wslconfig` |
| `Ollama not reachable on this machine` | Ollama isn't installed or running | Install from ollama.com and start it; the app works without AI meanwhile |
| `App container cannot reach the host's Ollama` | Linux: Ollama listens on 127.0.0.1 only | `sudo systemctl edit ollama`, add `[Service]` `Environment="OLLAMA_HOST=0.0.0.0"`, then `sudo systemctl restart ollama` |
| `idr-init exited with code 1` | Schema push or seed failed | `docker logs idr-init`, then `docker compose up init` |
| `Database has no tables` | `init` never ran successfully | `docker compose up init` |
| `App health: unhealthy` | The app cannot reach the database | `docker logs idr-app`, and check `POSTGRES_*` in `.env` |
| `CREDENTIALS_KEY is not set` | Old `.env` without the key | Add `CREDENTIALS_KEY=$(openssl rand -hex 32)` to `.env`, then `docker compose up -d app` |
| Build fails in `npm ci` | Network/proxy problem, or Docker is out of disk | Check internet access; run `docker system prune` |

---

## 6. Day-to-day commands

```bash
docker compose ps                     # status
docker compose logs -f app            # follow app logs
docker compose restart app            # restart one service
docker compose down                   # stop (data is kept in volumes)
docker compose down -v                # stop and DELETE all data
git pull && ./deploy/scripts/docker-up.sh    # update to the latest code and rebuild
./deploy/scripts/backup.sh                   # extra on-demand backup (daily backups are automatic)
docker logs idr-scheduler             # scheduled scan results
ls backups/                           # automatic daily backups
```

---

## 7. Production notes

- Set `DOMAIN=radar.example.com`, `NEXTAUTH_URL=https://radar.example.com` and
  `NEXT_PUBLIC_APP_URL=https://radar.example.com` in `.env`. Point DNS at the host and open
  ports 80/443. Caddy then gets a Let's Encrypt certificate automatically.
- Keep `.env` secret and backed up. If you lose `CREDENTIALS_KEY`, the stored connector credentials can't be decrypted.
- For a production server, use `./deploy/scripts/deploy.sh --domain radar.example.com` instead of `docker-up.sh`.
  It loads no demo data, generates every secret on the first run and keeps them on later runs, and starts
  the scheduler and daily backups (`deploy/docker/backups/`).
- Scan times use UTC; set `SCHEDULE_TZ=Asia/Riyadh` (or another time zone) in the env file to change that.
  Backups run at `BACKUP_HOUR` (UTC, default 2) and keep `BACKUP_KEEP` files (default 14).
- For hardened or air-gapped installs see [hardened-environment.md](./hardened-environment.md)
  and [../getting-started/install-airgap.md](../getting-started/install-airgap.md).

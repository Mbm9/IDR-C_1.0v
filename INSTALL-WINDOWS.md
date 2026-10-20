# Install Identity Radar on Windows (Docker)

Simple steps to run Identity Radar on a Windows 10/11 or Windows Server PC with Docker Desktop.
It takes about 15 minutes, most of it the first build.

---

## What you need

- Windows 10 (21H2 or newer), Windows 11, or Windows Server 2022
- 8 GB RAM at least (16 GB is better)
- 20 GB of free disk space
- Internet access for the first install
- Administrator rights, to install the programs below

---

## Step 1: Install Docker Desktop

1. Download it from <https://www.docker.com/products/docker-desktop/> and run the installer.
2. When the installer asks, keep **Use WSL 2** ticked.
3. Restart the PC if it asks you to.
4. Open **Docker Desktop** and wait until it says **Engine running** (bottom left).

> If the Docker tray icon menu shows **"Switch to Linux containers…"**, click it.
> Identity Radar needs Linux containers, which is the default.

## Step 2: Install Git for Windows

1. Download it from <https://git-scm.com/download/win> and run the installer.
2. Keep all the default options.

You need it for **Git Bash**, the terminal that runs the install script. You don't need to know Git.

## Step 3 (optional): Install Ollama for the AI features

Skip this step if you don't need the AI features. The rest of the app works without them.

1. Download it from <https://ollama.com/download> and run the installer.
2. Open **PowerShell** and run:

   ```powershell
   ollama pull qwen2.5:1.5b
   ```

## Step 4: Unzip Identity Radar

1. Get the Identity Radar ZIP file, either the file you were given or from GitHub
   (**Code → Download ZIP**). It is named like `IDR-C_1.0v-main.zip`.
2. Right-click the ZIP file → **Extract All…**, type `C:\` as the destination, and click **Extract**.
3. In File Explorer, rename the new folder (for example `C:\IDR-C_1.0v-main`) to **`IdentityRadar`**.
4. Open `C:\IdentityRadar` and check that you see `docker-compose.yml` and the folders `deploy`, `src` and `docs`.

> **See only one folder inside?** Windows extracted it one level too deep. Open that inner folder,
> select everything inside it, and move it up into `C:\IdentityRadar`.

> **Keep the folder name `IdentityRadar`.** Docker names the database after this folder.
> If you rename it later, the app starts with an empty database. Your old data is not deleted,
> but the app won't use it until you rename the folder back.

## Step 5: Start Identity Radar

1. Open **Git Bash** from the Start menu.
2. Copy and paste these commands one at a time, pressing **Enter** after each:

   ```bash
   cd /c/IdentityRadar
   ./deploy/scripts/docker-up.sh --no-caddy
   ```

Wait until you see **"Identity Radar is running."** The first run takes 5–10 minutes while the
images are built. Later starts take seconds.

The script creates a `.env` file with random passwords, builds the app, sets up the database with
demo data, and starts everything.

## Step 6: Open the app and sign in

1. Open <http://localhost:3000> in your browser.
2. Sign in with:
   - **Email:** `admin@acmefs.sa`
   - **Password:** printed at the end of Step 5. It is also saved in `C:\IdentityRadar\.env`
     on the `SEED_ADMIN_PASSWORD=` line.

Done.

---

## Everyday use

Run these in **Git Bash** inside `C:\IdentityRadar` (`cd /c/IdentityRadar`):

| To do this | Run |
|---|---|
| Stop the app (your data is kept) | `docker compose down` |
| Start it again | `docker compose up -d` |
| See whether it is running | `docker compose ps` |
| See the app logs | `docker compose logs -f app` (press Ctrl+C to exit) |
| Update to a new version | See [Update to a new version](#update-to-a-new-version) below |
| Start with an empty database (no demo data) | `./deploy/scripts/docker-up.sh --no-caddy --no-demo` |
| **Delete everything** and start over | `docker compose down -v` |

Docker Desktop must be running before you start the app. Database backups are written to
`C:\IdentityRadar\backups` once a day.

---

## Update to a new version

Your data is kept. The important part is to keep your `.env` file: it holds your passwords and
the key that unlocks saved connector credentials.

1. In Git Bash, stop the app and save your settings and backups outside the folder:

   ```bash
   cd /c/IdentityRadar
   docker compose down
   mkdir -p ~/idr-keep && cp .env ~/idr-keep/ && cp -r backups ~/idr-keep/ 2>/dev/null
   ```

2. Close Git Bash. In File Explorer, rename `C:\IdentityRadar` to `C:\IdentityRadar-old`.
3. Extract the new ZIP exactly as in **Step 4**, so you again have `C:\IdentityRadar`
   with the **same name**.
4. Open Git Bash, put your settings back and start:

   ```bash
   cd /c/IdentityRadar
   cp ~/idr-keep/.env . && cp -r ~/idr-keep/backups . 2>/dev/null
   ./deploy/scripts/docker-up.sh --no-caddy
   ```

5. Sign in and check that your data is there, then delete `C:\IdentityRadar-old`.

> Forgot to copy `.env`? It is still in `C:\IdentityRadar-old`. Copy it into `C:\IdentityRadar`
> and run the start command again.

---

## If something goes wrong

First, run the built-in check. It lists every problem it finds and how to fix it:

```bash
./deploy/scripts/doctor.sh
```

Common problems:

| Problem | Fix |
|---|---|
| `Docker daemon not reachable` | Open Docker Desktop and wait for **Engine running**, then try again. |
| `\r: not found` or `pipefail\r` | Run `sed -i 's/\r$//' deploy/scripts/*.sh deploy/docker/*.sh deploy/docker/Caddyfile`, then repeat Step 5. |
| `Port 3000 is already used` | Another program uses port 3000. Close it, or find it with `netstat -ano \| findstr :3000` in PowerShell and end that process in Task Manager. |
| `Port 5432 is already used` | A local PostgreSQL is running. Stop it in `services.msc`. |
| The build stops or is very slow | Docker needs more memory. Docker Desktop → Settings → Resources, or see the full guide below. |
| The page says the password is wrong | The password only applies to the first install. To reset everything: `./deploy/scripts/docker-up.sh --no-caddy --reset` (**this deletes all data**). |
| AI features say they are off | Ollama is not installed or not running. See Step 3. |

Need more detail (HTTPS, a real domain, production servers)? See
[docs/deployment/docker-windows.md](docs/deployment/docker-windows.md).

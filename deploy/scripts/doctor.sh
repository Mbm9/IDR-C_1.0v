#!/usr/bin/env bash
# =============================================================================
# Identity Radar — Doctor
#
# Diagnoses the Docker deployment and prints every problem it finds with a
# suggested fix. Safe to run at any time; it never changes anything.
# Designed for Docker Desktop on Windows (Git Bash or WSL), works on Linux/macOS.
#
# Usage:
#   ./deploy/scripts/doctor.sh                  # full check
#   ./deploy/scripts/doctor.sh --logs 200       # scan more log lines per container
#   ./deploy/scripts/doctor.sh --report out.txt # also save the output to a file
#
# Exit code: 0 = no errors (warnings allowed), 1 = at least one error.
# =============================================================================
set -uo pipefail

export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

LOG_LINES=100
REPORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --logs)   LOG_LINES="${2:?--logs needs a number}"; shift ;;
    --report) REPORT="${2:?--report needs a file}"; shift ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)"; exit 1 ;;
  esac
  shift
done

if [[ -n "$REPORT" ]]; then
  exec > >(tee "$REPORT") 2>&1
fi

if [[ -t 1 && -z "$REPORT" ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; DIM=''; NC=''
fi

ERRORS=0
WARNINGS=0
ISSUES=()

ok()   { echo -e "  ${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; [[ -n "${2:-}" ]] && echo -e "         ${DIM}fix: $2${NC}"; WARNINGS=$((WARNINGS+1)); ISSUES+=("WARN  $1"); }
err()  { echo -e "  ${RED}[FAIL]${NC} $1"; [[ -n "${2:-}" ]] && echo -e "         ${DIM}fix: $2${NC}"; ERRORS=$((ERRORS+1)); ISSUES+=("FAIL  $1"); }
note() { echo -e "  ${CYAN}[INFO]${NC} $*"; }
section() { echo -e "\n${BOLD}$*${NC}"; }

# Read a value from .env (last occurrence wins and surrounding quotes are
# stripped, like compose does)
env_get() {
  [[ -f .env ]] || return 0
  local v
  v="$(grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '\r')"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

# Is a TCP port listening on the host? Works with Windows netstat (Git Bash),
# ss (Linux/WSL) or lsof (macOS). The local address is column 2 in Windows
# netstat but column 4 in BSD/Linux netstat, so both are checked.
port_in_use() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${p}\$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -Ei 'listen' | awk '{print $2; print $4}' | grep -Eq "[:.]${p}\$"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 2
  fi
}

http_get() { curl -ksS -m 8 "$@" 2>/dev/null; }

echo -e "${BOLD}Identity Radar — Doctor${NC}  ($(date '+%Y-%m-%d %H:%M:%S'))"
echo -e "${DIM}Project: $PROJECT_DIR${NC}"

# -----------------------------------------------------------------------------
section "1. Host & shell"
# -----------------------------------------------------------------------------
UNAME="$(uname -s 2>/dev/null || echo unknown)"
case "$UNAME" in
  MINGW*|MSYS*|CYGWIN*) note "Shell: Git Bash / MSYS on Windows ($UNAME)" ;;
  Linux*)
    if grep -qi microsoft /proc/version 2>/dev/null; then
      note "Shell: WSL ($(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-Linux}"))"
      case "$PROJECT_DIR" in
        /mnt/[a-z]/*) warn "Project is on the Windows filesystem ($PROJECT_DIR) — builds are much slower from WSL" \
                           "clone into the WSL home dir (e.g. ~/IDR-C) for faster builds" ;;
      esac
    else
      note "Shell: Linux"
    fi ;;
  Darwin*) note "Shell: macOS" ;;
  *) note "Shell: $UNAME" ;;
esac

for tool in docker curl; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool found ($(command -v "$tool"))"
  else err "$tool not found on PATH" "install it (Docker Desktop provides docker; Git for Windows provides curl)"; fi
done

if [[ "$PROJECT_DIR" == *" "* ]]; then
  warn "Project path contains spaces: $PROJECT_DIR" "move the project to a path without spaces, e.g. C:\\IDR-C"
fi

# -----------------------------------------------------------------------------
section "2. Docker engine"
# -----------------------------------------------------------------------------
DOCKER_OK=false
if ! command -v docker >/dev/null 2>&1; then
  err "Docker CLI missing — skipping Docker checks" "install Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/"
elif ! docker info >/dev/null 2>&1; then
  err "Docker daemon not reachable" "start Docker Desktop and wait for 'Engine running'; in WSL enable Settings > Resources > WSL integration for your distro"
else
  DOCKER_OK=true
  ok "Docker engine $(docker version --format '{{.Server.Version}}' 2>/dev/null) running"

  # One daemon round trip for all engine facts (each call is slow on Docker Desktop)
  IFS='|' read -r os_type op_sys kernel mem_bytes cpus < <(
    docker info --format '{{.OSType}}|{{.OperatingSystem}}|{{.KernelVersion}}|{{.MemTotal}}|{{.NCPU}}' 2>/dev/null
  )
  if [[ "$os_type" != "linux" ]]; then
    err "Docker is in '$os_type' container mode" "right-click the Docker tray icon > 'Switch to Linux containers...'"
  else
    ok "Linux containers mode"
  fi

  note "Engine OS: $op_sys (kernel $kernel)"
  # The WSL 2 backend only exists on Windows; macOS/Linux Docker Desktop use linuxkit.
  ON_WINDOWS=false
  case "$UNAME" in MINGW*|MSYS*|CYGWIN*) ON_WINDOWS=true ;; esac
  grep -qi microsoft /proc/version 2>/dev/null && ON_WINDOWS=true
  if $ON_WINDOWS && [[ "$op_sys" == *"Docker Desktop"* && "$kernel" != *"WSL2"* && "$kernel" != *"microsoft"* ]]; then
    warn "Docker Desktop does not appear to use the WSL 2 backend" "Settings > General > 'Use the WSL 2 based engine'"
  fi

  if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose $(docker compose version --short 2>/dev/null)"
  else
    err "'docker compose' v2 plugin not available" "update Docker Desktop (docker-compose v1 is not supported)"
    DOCKER_OK=false
  fi

  mem_gb=$(( ${mem_bytes:-0} / 1024 / 1024 / 1024 ))
  cpus="${cpus:-?}"
  # The AI model runs in the host's Ollama, so Docker only needs room for the app and database
  need=2
  if (( mem_gb < need )); then
    err "Docker has ${mem_gb} GB RAM / ${cpus} CPUs — the stack needs at least ${need} GB" \
        "raise memory in %UserProfile%\\.wslconfig ([wsl2] memory=4GB) then 'wsl --shutdown'"
  else
    ok "Docker resources: ${mem_gb} GB RAM, ${cpus} CPUs"
  fi

  # Disk: measured inside a running project container (avoids pulling an image)
  df_line=""
  for c in idr-db idr-app; do
    if [[ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" == "true" ]]; then
      df_line="$(docker exec "$c" df -Pk / 2>/dev/null | tail -n1)"
      [[ -n "$df_line" ]] && break
    fi
  done
  if [[ -n "$df_line" ]]; then
    avail_gb=$(( $(echo "$df_line" | awk '{print $4}') / 1024 / 1024 ))
    if (( avail_gb < 10 )); then
      err "Only ${avail_gb} GB free in Docker's disk" "run 'docker system prune' or enlarge the Docker Desktop disk"
    elif (( avail_gb < 20 )); then
      warn "Only ${avail_gb} GB free in Docker's disk (20 GB+ recommended)" "run 'docker system prune'"
    else
      ok "Docker disk free: ${avail_gb} GB"
    fi
  fi
fi

# -----------------------------------------------------------------------------
section "3. Project files"
# -----------------------------------------------------------------------------
for f in docker-compose.yml deploy/docker/Dockerfile deploy/docker/init-db.sh deploy/docker/Caddyfile deploy/docker/scheduler.mjs deploy/docker/backup-loop.sh package-lock.json; do
  [[ -f "$f" ]] && ok "$f present" || err "$f missing" "re-clone the repository"
done

crlf_files=()
for f in deploy/docker/*.sh deploy/scripts/*.sh deploy/docker/Caddyfile .env; do
  [[ -f "$f" ]] && grep -q $'\r' "$f" && crlf_files+=("$f")
done
if (( ${#crlf_files[@]} > 0 )); then
  err "Windows (CRLF) line endings in: ${crlf_files[*]} — containers will fail with '\\r: not found'" \
      "quick fix: sed -i 's/\\\\r\$//' deploy/scripts/*.sh deploy/docker/*.sh deploy/docker/Caddyfile   permanent: git config core.autocrlf input, commit or stash your changes, then git rm -r --cached -q . && git reset --hard (discards uncommitted edits)"
else
  ok "Shell scripts use LF line endings"
fi

if [[ "$(git config --get core.autocrlf 2>/dev/null)" == "true" && ! -f .gitattributes ]]; then
  warn "git core.autocrlf=true and no .gitattributes" "git config core.autocrlf input"
fi

if [[ ! -f .env ]]; then
  warn ".env not found — compose falls back to insecure defaults" "run ./deploy/scripts/docker-up.sh (creates .env with generated secrets)"
else
  ok ".env present"
  for key in NEXTAUTH_SECRET POSTGRES_PASSWORD; do
    v="$(env_get "$key")"
    if [[ -z "$v" ]]; then
      warn "$key is empty in .env" "set a random value (openssl rand -hex 32)"
    elif [[ "$v" =~ (CHANGE_ME|changeme|generate-a-random|change-in-production) ]]; then
      warn "$key still has a placeholder value" "replace it with a random value (openssl rand -hex 32)"
    fi
  done
  ck="$(env_get CREDENTIALS_KEY)"
  if [[ -z "$ck" ]]; then
    warn "CREDENTIALS_KEY is not set — saving connector credentials will fail" "add CREDENTIALS_KEY=<64 hex chars> (openssl rand -hex 32)"
  elif ! [[ "$ck" =~ ^[0-9a-fA-F]{64}$ ]]; then
    err "CREDENTIALS_KEY must be exactly 64 hex characters" "regenerate with: openssl rand -hex 32"
  fi
fi

if $DOCKER_OK; then
  if cfg_err="$(docker compose config -q 2>&1)"; then
    ok "docker compose config is valid"
  else
    err "docker compose config is invalid: $cfg_err" "fix the YAML / .env syntax shown above"
  fi
fi

# -----------------------------------------------------------------------------
section "4. Ports"
# -----------------------------------------------------------------------------
for p in 3000 5432 80 443; do
  case "$p" in 3000) owner=idr-app ;; 5432) owner=idr-db ;; *) owner=idr-caddy ;; esac
  running_owner=false
  if $DOCKER_OK && [[ "$(docker inspect -f '{{.State.Running}}' "$owner" 2>/dev/null)" == "true" ]]; then
    running_owner=true
  fi
  port_in_use "$p"; rc=$?
  if (( rc == 2 )); then
    note "Cannot check port $p (no ss/netstat/lsof)"
  elif (( rc == 0 )); then
    if $running_owner; then ok "Port $p in use by $owner"
    else
      sev=err; [[ "$p" == 80 || "$p" == 443 ]] && sev=warn
      $sev "Port $p is already used by another program" \
           "find it with: netstat -ano | findstr :$p  (then stop it in Task Manager by PID), or change the port mapping in docker-compose.yml"
    fi
  else
    if $running_owner; then
      warn "$owner is running but port $p is not listening on the host" "check 'docker compose ps' port mappings"
    else
      ok "Port $p is free"
    fi
  fi
done

# -----------------------------------------------------------------------------
section "5. Containers"
# -----------------------------------------------------------------------------
ERROR_PATTERN='(error|fatal|panic|exception|ECONNREFUSED|ENOTFOUND|EADDRINUSE|out of memory|OOM|killed|not found|permission denied|no space left)'
# Benign lines: Postgres refusing connections while it boots (before its health
# check passes), the Alpine image lacking the `locale` binary, and Auth.js
# logging a sign-in with a wrong password (expected; failed logins are audited).
IGNORE_PATTERN='(0 errors|error_count|errorBoundary|NEXT_REDIRECT|"level":"info"|the database system is starting up|locale: not found|CredentialsSignin)'

if $DOCKER_OK; then
  for c in idr-db idr-init idr-app idr-scheduler idr-backup idr-caddy; do
    if ! docker inspect "$c" >/dev/null 2>&1; then
      if [[ "$c" == "idr-caddy" ]]; then
        note "$c not created (optional HTTPS proxy; skipped with --no-caddy)"
      elif [[ "$c" == "idr-scheduler" ]]; then
        warn "$c does not exist: scans will not run on schedule" "update to the latest code and run ./deploy/scripts/docker-up.sh"
      elif [[ "$c" == "idr-backup" ]]; then
        warn "$c does not exist: no automatic daily backups" "update to the latest code and run ./deploy/scripts/docker-up.sh"
      else
        err "$c does not exist" "run ./deploy/scripts/docker-up.sh"
      fi
      continue
    fi

    IFS='|' read -r status health restarts exit_code oom < <(
      docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.RestartCount}}|{{.State.ExitCode}}|{{.State.OOMKilled}}' "$c"
    )
    label="$c: $status${health:+ ($health)}"

    if [[ "$c" == "idr-init" ]]; then
      if [[ "$status" == "exited" && "$exit_code" == "0" ]]; then ok "$c completed successfully (schema + seed)"
      elif [[ "$status" == "running" ]]; then note "$c still running (initialising database)"
      else err "$c exited with code $exit_code" "see 'docker logs idr-init'; then re-run: docker compose up init"; fi
    elif [[ "$oom" == "true" ]]; then
      err "$label — killed by OOM (out of memory)" "give Docker more memory"
    elif [[ "$status" != "running" ]]; then
      err "$label (exit code $exit_code)" "docker logs $c   then   docker compose up -d $c"
    elif [[ "$health" == "unhealthy" ]]; then
      err "$label" "docker logs $c"
    elif [[ "$health" == "starting" ]]; then
      warn "$label — still starting" "wait a minute and run doctor again"
    else
      ok "$label"
    fi
    if (( restarts > 2 )); then
      warn "$c has restarted $restarts times (crash loop?)" "docker logs $c"
    fi

    # Recent error lines in logs
    matches="$(docker logs --tail "$LOG_LINES" "$c" 2>&1 | grep -Ei "$ERROR_PATTERN" | grep -Evi "$IGNORE_PATTERN" | tail -n 5)"
    if [[ -n "$matches" ]]; then
      echo -e "         ${YELLOW}recent log errors (last $LOG_LINES lines):${NC}"
      echo "$matches" | cut -c1-220 | sed 's/^/           | /'
      WARNINGS=$((WARNINGS+1)); ISSUES+=("WARN  error lines in $c logs")
    fi
  done
else
  note "Skipped (Docker not available)"
fi

# -----------------------------------------------------------------------------
section "6. Services"
# -----------------------------------------------------------------------------
if $DOCKER_OK && [[ "$(docker inspect -f '{{.State.Running}}' idr-db 2>/dev/null)" == "true" ]]; then
  pg_user="$(env_get POSTGRES_USER)"; pg_user="${pg_user:-postgres}"
  pg_db="$(env_get POSTGRES_DB)"; pg_db="${pg_db:-identity_radar}"
  if docker exec idr-db pg_isready -U "$pg_user" -d "$pg_db" >/dev/null 2>&1; then
    ok "PostgreSQL accepting connections ($pg_db)"
    tables="$(docker exec idr-db psql -U "$pg_user" -d "$pg_db" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '\r ')"
    if [[ -z "$tables" || "$tables" == "0" ]]; then
      err "Database has no tables — schema was not pushed" "docker compose up init   (and check: docker logs idr-init)"
    else
      ok "Database schema: $tables tables"
      orgs="$(docker exec idr-db psql -U "$pg_user" -d "$pg_db" -tAc "SELECT count(*) FROM organizations" 2>/dev/null | tr -d '\r ')"
      users="$(docker exec idr-db psql -U "$pg_user" -d "$pg_db" -tAc "SELECT count(*) FROM users" 2>/dev/null | tr -d '\r ')"
      if [[ "${orgs:-0}" == "0" || "${users:-0}" == "0" ]]; then
        warn "No organizations/users in the database — you cannot log in yet" "docker compose up init"
      else
        ok "Data: $orgs organization(s), $users user(s)"
      fi
    fi
  else
    err "PostgreSQL not accepting connections" "docker logs idr-db"
  fi
else
  note "PostgreSQL check skipped (idr-db not running)"
fi

# Ollama runs on the host (installed separately), not in a container. AI is optional: warnings only.
model="$(env_get OLLAMA_MODEL)"; model="${model:-qwen2.5:1.5b}"
tags="$(http_get "${OLLAMA_HOST_URL:-http://localhost:11434}/api/tags")"
if [[ -z "$tags" ]]; then
  warn "Ollama not reachable on this machine (${OLLAMA_HOST_URL:-http://localhost:11434})" "start Ollama (the Ollama app, or 'ollama serve'); AI features are off until then"
elif echo "$tags" | grep -q "\"name\":\"$model\""; then
  ok "Ollama model '$model' available on the host"
else
  warn "Ollama model '$model' not pulled on the host" "ollama pull $model"
fi
if [[ -n "$tags" ]] && $DOCKER_OK && [[ "$(docker inspect -f '{{.State.Running}}' idr-app 2>/dev/null)" == "true" ]]; then
  if docker exec idr-app node -e "fetch(process.env.OLLAMA_URL + '/api/tags').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" 2>/dev/null; then
    ok "App container reaches the host's Ollama"
  else
    warn "App container cannot reach the host's Ollama" "on Linux Ollama listens on 127.0.0.1 only: 'sudo systemctl edit ollama', add [Service] Environment=\"OLLAMA_HOST=0.0.0.0\", then 'sudo systemctl restart ollama'"
  fi
fi

health_json="$(http_get http://localhost:3000/api/health)"
if [[ -z "$health_json" ]]; then
  err "App not reachable at http://localhost:3000/api/health" "docker logs idr-app"
else
  # The overall status is one of three values; nested checks also carry a
  # "status" ("up"/"down"), so match only the overall values, first occurrence.
  h_status="$(echo "$health_json" | grep -oE '"status":"(healthy|degraded|unhealthy)"' | head -n1 | cut -d'"' -f4)"
  case "$h_status" in
    healthy)  ok "App health: healthy" ;;
    degraded) warn "App health: degraded (database OK, configured AI provider unreachable)" "check that Ollama is running on the host and OLLAMA_MODEL is pulled (ollama list); set AI_PROVIDER=none to run without AI" ;;
    *)        err "App health: ${h_status:-unknown} — $(echo "$health_json" | tr -d "\n" | cut -c1-120)" "check DATABASE_URL and 'docker logs idr-app'" ;;
  esac
  login_code="$(curl -ks -o /dev/null -w '%{http_code}' -m 8 http://localhost:3000/login 2>/dev/null)"
  if [[ "$login_code" =~ ^(200|307|308)$ ]]; then ok "Login page responds (HTTP $login_code)"
  else err "Login page returned HTTP $login_code" "docker logs idr-app"; fi
fi

# Scheduler: did recent scheduled scans succeed?
if $DOCKER_OK && [[ "$(docker inspect -f '{{.State.Running}}' idr-scheduler 2>/dev/null)" == "true" ]]; then
  sched_log="$(docker logs --tail 200 idr-scheduler 2>&1)"
  runs_ok="$(echo "$sched_log" | grep -c '"job".*"ok":true' || true)"
  runs_bad="$(echo "$sched_log" | grep -c '"job".*"ok":false' || true)"
  if echo "$sched_log" | grep -q 'CRON_SECRET is not set'; then
    err "Scheduler has no CRON_SECRET; scans are not running" "add CRON_SECRET to .env, then: docker compose up -d scheduler app"
  elif (( runs_bad > 0 )); then
    warn "Scheduled scans: $runs_ok succeeded, $runs_bad failed (last 200 log lines)" "docker logs idr-scheduler"
  elif (( runs_ok > 0 )); then
    ok "Scheduled scans running ($runs_ok recent runs succeeded)"
  else
    note "Scheduler started; no scan has finished yet"
  fi
fi

# Backups: newest file in ./backups
if $DOCKER_OK && [[ "$(docker inspect -f '{{.State.Running}}' idr-backup 2>/dev/null)" == "true" ]]; then
  # docker-up.sh writes to ./backups; deploy.sh (production compose) to deploy/docker/backups
  newest="$(ls -1t backups/identity-radar-*.sql.gz deploy/docker/backups/identity-radar-*.sql.gz 2>/dev/null | head -n1)"
  if [[ -n "$newest" ]]; then ok "Latest backup: $newest"
  else note "Backup container running; first backup not written yet (docker logs idr-backup)"; fi
fi

if $DOCKER_OK && [[ "$(docker inspect -f '{{.State.Running}}' idr-caddy 2>/dev/null)" == "true" ]]; then
  domain="$(env_get DOMAIN)"; domain="${domain:-localhost}"
  code="$(curl -ks -o /dev/null -w '%{http_code}' -m 8 --resolve "$domain:443:127.0.0.1" "https://$domain/api/health" 2>/dev/null)"
  if [[ "$code" == "200" ]]; then ok "Caddy HTTPS proxy https://$domain → app (HTTP $code)"
  else warn "Caddy HTTPS proxy returned HTTP ${code:-none} for https://$domain" "docker logs idr-caddy (a real domain needs DNS + open ports 80/443)"; fi
fi

# -----------------------------------------------------------------------------
section "Summary"
# -----------------------------------------------------------------------------
if (( ERRORS == 0 && WARNINGS == 0 )); then
  echo -e "  ${GREEN}${BOLD}All checks passed.${NC} Open http://localhost:3000"
else
  for i in "${ISSUES[@]}"; do
    [[ "$i" == FAIL* ]] && echo -e "  ${RED}$i${NC}" || echo -e "  ${YELLOW}$i${NC}"
  done
  echo
  echo -e "  ${BOLD}${ERRORS} error(s), ${WARNINGS} warning(s)${NC}"
  echo -e "  ${DIM}Full logs: docker compose logs --tail 200 <db|init|app|scheduler|backup|caddy>${NC}"
fi
[[ -n "$REPORT" ]] && echo -e "  Report saved to: $REPORT"

(( ERRORS == 0 ))

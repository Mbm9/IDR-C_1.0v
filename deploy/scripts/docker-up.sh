#!/usr/bin/env bash
# =============================================================================
# Identity Radar — Build & Start (Docker Compose)
#
# Builds the images and brings up the full stack defined in docker-compose.yml
# (db, init, app, scheduler, backup, caddy). Designed for Docker Desktop on
# Windows (run from Git Bash or WSL) but works on Linux/macOS too.
# AI uses the Ollama already installed on this machine (not a container).
#
# Usage:
#   ./deploy/scripts/docker-up.sh                 # build + start everything
#   ./deploy/scripts/docker-up.sh --no-caddy      # skip Caddy (no ports 80/443 needed)
#   ./deploy/scripts/docker-up.sh --no-cache      # rebuild images from scratch
#   ./deploy/scripts/docker-up.sh --reset         # wipe volumes (DB, certificates) first
#   ./deploy/scripts/docker-up.sh --no-demo       # no Acme demo data; create the first account at /signup
#   ./deploy/scripts/docker-up.sh --model qwen2.5:7b   # pulled into the host Ollama if missing
#   ./deploy/scripts/docker-up.sh --logs          # follow logs after start
#
# After it finishes, run ./deploy/scripts/doctor.sh if anything looks wrong.
# =============================================================================
set -euo pipefail

# Git Bash on Windows rewrites "/path" arguments into "C:/Program Files/Git/path"
# which breaks paths passed to `docker exec`. Disable that conversion.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
NO_CACHE=false
NO_CADDY=false
RESET=false
NO_DEMO=false
FOLLOW_LOGS=false
MODEL=""
APP_TIMEOUT=600   # seconds to wait for the app to become healthy

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cache) NO_CACHE=true ;;
    --no-caddy) NO_CADDY=true ;;
    --reset)    RESET=true ;;
    --no-demo)  NO_DEMO=true ;;
    --logs)     FOLLOW_LOGS=true ;;
    --model)    MODEL="${2:?--model needs a value}"; shift ;;
    --timeout)  APP_TIMEOUT="${2:?--timeout needs a value}"; shift ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1 (see --help)"; exit 1 ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*" >&2; echo -e "        Run ${BOLD}./deploy/scripts/doctor.sh${NC} for a full diagnosis." >&2; exit 1; }
step()    { echo -e "\n${BOLD}==> $*${NC}"; }

# Portable in-place edit: GNU and BSD (macOS) sed disagree on `-i`, so write
# to a temp file and copy back (keeps the file's permissions).
rewrite_file() {
  local file="$1"; shift
  "$@" < "$file" > "$file.tmp.$$" && cat "$file.tmp.$$" > "$file"
  local rc=$?
  rm -f "$file.tmp.$$"
  return $rc
}
strip_cr() { rewrite_file "$1" tr -d '\r'; }

# Value of KEY in .env (last occurrence wins, surrounding quotes stripped like compose)
env_get() {
  [[ -f .env ]] || return 0
  local v
  v="$(grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '\r' || true)"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

random_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    od -An -tx1 -N"$bytes" /dev/urandom | tr -d ' \n'
  fi
}

# ---------------------------------------------------------------------------
# 1. Pre-flight
# ---------------------------------------------------------------------------
step "Pre-flight checks"

command -v docker >/dev/null 2>&1 || fail "docker not found. Install Docker Desktop and make sure it is on PATH."
docker info >/dev/null 2>&1 || fail "Docker daemon is not reachable. Start Docker Desktop and wait until it says 'Engine running'."
docker compose version >/dev/null 2>&1 || fail "'docker compose' (v2) not available. Update Docker Desktop."
success "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null) / $(docker compose version --short 2>/dev/null)"

[[ -f docker-compose.yml ]] || fail "docker-compose.yml not found in $PROJECT_DIR"

# Windows checkouts may convert LF -> CRLF. Scripts mounted/copied into Linux
# containers then fail with "/bin/sh^M: not found". Fix them in place.
crlf_fixed=0
for f in deploy/docker/*.sh deploy/scripts/*.sh deploy/docker/Caddyfile; do
  [[ -f "$f" ]] || continue
  if grep -q $'\r' "$f"; then
    strip_cr "$f"
    crlf_fixed=$((crlf_fixed + 1))
    warn "Converted CRLF -> LF: $f"
  fi
done
[[ $crlf_fixed -eq 0 ]] && success "Line endings OK (LF)"

# ---------------------------------------------------------------------------
# 2. Environment file (.env is read automatically by docker compose)
# ---------------------------------------------------------------------------
step "Environment"

if [[ -f .env ]]; then
  if grep -q $'\r' .env; then strip_cr .env; warn "Converted CRLF -> LF: .env"; fi
  success ".env exists — keeping your values"
  # Older .env files may predate these secrets. Compose refuses to start without
  # NEXTAUTH_SECRET, and cron/credential encryption need the other two.
  for key in NEXTAUTH_SECRET CRON_SECRET CREDENTIALS_KEY; do
    if [[ -z "$(env_get "$key")" ]]; then
      grep -vE "^${key}=" .env > .env.tmp.$$ || true
      cat .env.tmp.$$ > .env; rm -f .env.tmp.$$
      echo "${key}=$(random_hex 32)" >> .env
      warn "Added missing ${key} to .env"
    fi
  done
else
  info "Creating .env with generated secrets"
  cat > .env <<EOF
# Generated by deploy/scripts/docker-up.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Read automatically by 'docker compose'. Do not commit this file.

POSTGRES_DB=identity_radar
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(random_hex 16)

NEXTAUTH_SECRET=$(random_hex 32)
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=$(random_hex 32)
CREDENTIALS_KEY=$(random_hex 32)

# Password for the seeded admin user (admin@acmefs.sa)
SEED_ADMIN_PASSWORD=$(random_hex 8)

# AI — qwen2.5:1.5b (~1 GB) is fast; qwen2.5:7b (~4.4 GB) gives better answers
OLLAMA_MODEL=qwen2.5:1.5b
ANTHROPIC_API_KEY=

# Caddy (HTTPS reverse proxy). Keep "localhost" for local use.
DOMAIN=localhost
EOF
  success ".env created"
fi

if $NO_DEMO; then
  grep -v '^SEED_DEMO=' .env > .env.tmp.$$ || true
  cat .env.tmp.$$ > .env; rm -f .env.tmp.$$
  echo "SEED_DEMO=false" >> .env
  info "SEED_DEMO=false: the database starts empty (no Acme demo data)"
fi

if [[ -n "$MODEL" ]]; then
  grep -v '^OLLAMA_MODEL=' .env > .env.tmp.$$ || true
  cat .env.tmp.$$ > .env; rm -f .env.tmp.$$
  echo "OLLAMA_MODEL=${MODEL}" >> .env
  info "OLLAMA_MODEL set to ${MODEL}"
fi

docker compose config -q || fail "docker-compose.yml / .env is invalid (see error above)."
success "Compose configuration is valid"

# ---------------------------------------------------------------------------
# 2b. Fixed stack name: migrate installs from before `name: identity-radar`
# ---------------------------------------------------------------------------
# Compose used to name the stack (and its volumes) after the folder, so a ZIP
# extracted under a new folder name started with an empty database. The stack
# is now always "identity-radar". Containers of the old folder-named stack
# block the fixed container names, and their data is copied (never moved or
# deleted) into the new volumes once, while the database is stopped.
STACK="identity-radar"
legacy_project=""
for c in $(docker ps -a --format '{{.Names}}' | grep -E '^idr-' || true); do
  p="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$c" 2>/dev/null || true)"
  if [[ -n "$p" && "$p" != "$STACK" ]]; then
    [[ "$c" == "idr-db" ]] && legacy_project="$p"
    docker rm -f "$c" >/dev/null && info "Removed container $c from the old stack '$p' (its data is kept)"
  fi
done
# No old container left (e.g. removed by hand): guess the folder-based name compose used
if [[ -z "$legacy_project" ]]; then
  legacy_project="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
fi

if ! $RESET && [[ "$legacy_project" != "$STACK" ]] \
   && ! docker volume inspect "${STACK}_pgdata" >/dev/null 2>&1 \
   && docker volume inspect "${legacy_project}_pgdata" >/dev/null 2>&1; then
  step "Migrating data to the fixed stack name '${STACK}'"
  for vol in pgdata caddy_data caddy_config; do
    docker volume inspect "${legacy_project}_${vol}" >/dev/null 2>&1 || continue
    docker volume create --label "com.docker.compose.project=${STACK}" \
      --label "com.docker.compose.volume=${vol}" "${STACK}_${vol}" >/dev/null
    docker run --rm -v "${legacy_project}_${vol}:/from:ro" -v "${STACK}_${vol}:/to" \
      postgres:16-alpine sh -c 'cp -a /from/. /to/' \
      || fail "Could not copy volume ${legacy_project}_${vol}. Your data is untouched in it."
    success "Copied ${legacy_project}_${vol} -> ${STACK}_${vol}"
  done
  info "The old volumes are kept as a backup. Once the app works, you can delete them:"
  info "  docker volume rm ${legacy_project}_pgdata ${legacy_project}_caddy_data ${legacy_project}_caddy_config"
fi

# ---------------------------------------------------------------------------
# 3. Optional reset
# ---------------------------------------------------------------------------
if $RESET; then
  step "Reset"
  warn "Removing containers AND volumes (database, certificates)"
  docker compose down -v --remove-orphans
fi

# ---------------------------------------------------------------------------
# 4. Build
# ---------------------------------------------------------------------------
step "Building images (first build takes several minutes)"
BUILD_ARGS=()
$NO_CACHE && BUILD_ARGS+=(--no-cache)
# ${arr[@]+...} form: an empty array under `set -u` is an error on bash < 4.4 (macOS /bin/bash 3.2)
docker compose build ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"} init app scheduler || fail "Image build failed (see output above)."
success "Images built"

# ---------------------------------------------------------------------------
# 5. Start
# ---------------------------------------------------------------------------
step "Starting database and initialisation"
# Services are started in stages so failures surface with their own logs:
# `docker compose up` blocks on depends_on conditions and only reports
# "dependency failed to start", which hides why init failed.
docker compose up -d --remove-orphans db init || {
  docker logs --tail 40 idr-init 2>&1 | sed 's/^/        /'
  fail "Could not start db/init."
}

for _ in $(seq 1 300); do
  state="$(docker inspect -f '{{.State.Status}}|{{.State.ExitCode}}' idr-init 2>/dev/null || echo missing)"
  if [[ "$state" == exited* ]]; then
    code="${state#*|}"
    if [[ "$code" == "0" ]]; then
      success "Database schema ready"
      break
    fi
    docker logs --tail 40 idr-init 2>&1 | sed 's/^/        /'
    fail "Init container exited with code $code."
  fi
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Status}}' idr-init 2>/dev/null)" == "exited" ]] || fail "Init did not finish in time."

step "Checking Ollama on this machine"
# Ollama is installed on the host, not run in a container: nothing to download
# or wait for here. AI is optional, so problems are warnings, not failures.
OLLAMA_HOST_URL="${OLLAMA_HOST_URL:-http://localhost:11434}"
ollama_model="$(env_get OLLAMA_MODEL)"; ollama_model="${ollama_model:-qwen2.5:1.5b}"
OLLAMA_UP=false
if ollama_tags="$(curl -fsS -m 5 "$OLLAMA_HOST_URL/api/tags" 2>/dev/null)"; then
  OLLAMA_UP=true
  success "Ollama is running at $OLLAMA_HOST_URL"
  if echo "$ollama_tags" | grep -q "\"name\":\"${ollama_model}\""; then
    success "Model '$ollama_model' is available"
  elif command -v ollama >/dev/null 2>&1; then
    info "Model '$ollama_model' not found — pulling it into the host Ollama"
    ollama pull "$ollama_model" || warn "Could not pull '$ollama_model'. AI features stay off until it is available."
  else
    warn "Model '$ollama_model' not found. Run: ollama pull $ollama_model"
  fi
else
  warn "Ollama is not reachable at $OLLAMA_HOST_URL. Start it (Ollama app, or 'ollama serve'); AI features stay off until then."
fi

step "Starting the app"
# scheduler runs the /api/cron/* scans; backup writes a daily dump to ./backups
SERVICES=(app scheduler backup)
$NO_CADDY || SERVICES+=(caddy)
docker compose up -d "${SERVICES[@]}" || fail "docker compose up failed."
success "Containers started: db init ${SERVICES[*]}"

# Readiness via the image's HEALTHCHECK, so no host curl is required.
deadline=$(( $(date +%s) + APP_TIMEOUT ))
last_note=0
while :; do
  app_state="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' idr-app 2>/dev/null || echo "missing|")"
  case "$app_state" in
    running\|healthy) success "App is healthy"; break ;;
    exited\|*|dead\|*|running\|unhealthy)
      docker logs --tail 40 idr-app 2>&1 | sed 's/^/        /'
      fail "App container is ${app_state/|/ }." ;;
  esac
  now=$(date +%s)
  (( now > deadline )) && fail "App did not become healthy within ${APP_TIMEOUT}s."
  if (( now - last_note >= 30 )); then
    info "app: ${app_state/|/ } ..."
    last_note=$now
  fi
  sleep 5
done

# The app reaches the host's Ollama through host.docker.internal. On Linux,
# Ollama listening only on 127.0.0.1 (its default) is not reachable from containers.
if $OLLAMA_UP; then
  if docker exec idr-app node -e "fetch(process.env.OLLAMA_URL + '/api/tags').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" 2>/dev/null; then
    success "App can reach Ollama on the host"
  else
    warn "The app container cannot reach the host's Ollama (AI features are off)."
    echo "        Ollama is probably listening on 127.0.0.1 only. On Linux, make it listen on all interfaces:"
    echo "          sudo systemctl edit ollama     # add:  [Service]"
    echo "                                         #       Environment=\"OLLAMA_HOST=0.0.0.0\""
    echo "          sudo systemctl restart ollama"
    echo "        Then block port 11434 from other machines with your firewall if needed."
  fi
fi

# ---------------------------------------------------------------------------
# 7. Summary
# ---------------------------------------------------------------------------
admin_pw="$(env_get SEED_ADMIN_PASSWORD)"
echo
docker compose ps
echo
echo -e "${GREEN}${BOLD}Identity Radar is running.${NC}"
echo -e "  App:    ${BOLD}http://localhost:3000${NC}"
domain="$(env_get DOMAIN)"
$NO_CADDY || echo -e "  HTTPS:  ${BOLD}https://${domain:-localhost}${NC} (self-signed for localhost)"
if [[ "$(env_get SEED_DEMO)" == "false" ]]; then
  echo -e "  Login:  create the first account at ${BOLD}http://localhost:3000/signup${NC} (it becomes the admin)"
else
  echo -e "  Login:  ${BOLD}admin@acmefs.sa${NC} / ${BOLD}${admin_pw:-admin123}${NC}"
  echo -e "          (only applies to the first seed; existing data keeps its password)"
fi
echo -e "  Scans:  run on schedule by idr-scheduler (docker logs idr-scheduler)"
echo -e "  Backup: daily to ./backups (restore: ./deploy/scripts/restore.sh <file>)"
echo
echo -e "  Diagnose: ./deploy/scripts/doctor.sh     Logs: docker compose logs -f app"
echo -e "  Stop:     docker compose down     Wipe: docker compose down -v"

if $FOLLOW_LOGS; then
  docker compose logs -f
fi

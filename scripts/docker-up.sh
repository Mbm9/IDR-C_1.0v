#!/usr/bin/env bash
# =============================================================================
# Identity Radar — Build & Start (Docker Compose)
#
# Builds the images and brings up the full stack defined in docker-compose.yml
# (db, ollama, init, app, caddy). Designed for Docker Desktop on Windows
# (run from Git Bash or WSL) but works on Linux/macOS too.
#
# Usage:
#   ./scripts/docker-up.sh                 # build + start everything
#   ./scripts/docker-up.sh --no-caddy      # skip Caddy (no ports 80/443 needed)
#   ./scripts/docker-up.sh --no-cache      # rebuild images from scratch
#   ./scripts/docker-up.sh --reset         # wipe volumes (DB, model) first
#   ./scripts/docker-up.sh --model qwen2.5:7b
#   ./scripts/docker-up.sh --logs          # follow logs after start
#
# After it finishes, run ./scripts/doctor.sh if anything looks wrong.
# =============================================================================
set -euo pipefail

# Git Bash on Windows rewrites "/path" arguments into "C:/Program Files/Git/path"
# which breaks paths passed to `docker exec`. Disable that conversion.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
NO_CACHE=false
NO_CADDY=false
RESET=false
FOLLOW_LOGS=false
MODEL=""
APP_TIMEOUT=900   # seconds to wait for the app (first run pulls the AI model)

usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cache) NO_CACHE=true ;;
    --no-caddy) NO_CADDY=true ;;
    --reset)    RESET=true ;;
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
fail()    { echo -e "${RED}[ERROR]${NC} $*" >&2; echo -e "        Run ${BOLD}./scripts/doctor.sh${NC} for a full diagnosis." >&2; exit 1; }
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
for f in docker/*.sh scripts/*.sh docker/Caddyfile; do
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
# Generated by scripts/docker-up.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
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

if [[ -n "$MODEL" ]]; then
  grep -v '^OLLAMA_MODEL=' .env > .env.tmp.$$ || true
  cat .env.tmp.$$ > .env; rm -f .env.tmp.$$
  echo "OLLAMA_MODEL=${MODEL}" >> .env
  info "OLLAMA_MODEL set to ${MODEL}"
fi

docker compose config -q || fail "docker-compose.yml / .env is invalid (see error above)."
success "Compose configuration is valid"

# ---------------------------------------------------------------------------
# 3. Optional reset
# ---------------------------------------------------------------------------
if $RESET; then
  step "Reset"
  warn "Removing containers AND volumes (database, AI model cache, certificates)"
  docker compose down -v --remove-orphans
fi

# ---------------------------------------------------------------------------
# 4. Build
# ---------------------------------------------------------------------------
step "Building images (first build takes several minutes)"
BUILD_ARGS=()
$NO_CACHE && BUILD_ARGS+=(--no-cache)
# ${arr[@]+...} form: an empty array under `set -u` is an error on bash < 4.4 (macOS /bin/bash 3.2)
docker compose build ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"} init app || fail "Image build failed (see output above)."
success "Images built"

# ---------------------------------------------------------------------------
# 5. Start
# ---------------------------------------------------------------------------
step "Starting database and initialisation"
# Services are started in stages so failures surface with their own logs:
# `docker compose up` blocks on depends_on conditions and only reports
# "dependency failed to start", which hides why init or ollama failed.
docker compose up -d --remove-orphans db init || {
  docker logs --tail 40 idr-init 2>&1 | sed 's/^/        /'
  fail "Could not start db/init."
}

for _ in $(seq 1 300); do
  state="$(docker inspect -f '{{.State.Status}}|{{.State.ExitCode}}' idr-init 2>/dev/null || echo missing)"
  if [[ "$state" == exited* ]]; then
    code="${state#*|}"
    if [[ "$code" == "0" ]]; then
      success "Schema pushed and data seeded"
      break
    fi
    docker logs --tail 40 idr-init 2>&1 | sed 's/^/        /'
    fail "Init container exited with code $code."
  fi
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Status}}' idr-init 2>/dev/null)" == "exited" ]] || fail "Init did not finish in time."

step "Starting Ollama (first run downloads the AI model — can take a while)"
docker compose up -d ollama || fail "Could not start ollama."
deadline=$(( $(date +%s) + APP_TIMEOUT ))
last_note=0
while :; do
  ollama_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.Status}}' idr-ollama 2>/dev/null || echo "|missing")"
  case "$ollama_health" in
    healthy\|*) success "Ollama is ready"; break ;;
    unhealthy\|*|*\|exited|*\|dead)
      docker logs --tail 40 idr-ollama 2>&1 | sed 's/^/        /'
      fail "Ollama failed to become healthy." ;;
  esac
  now=$(date +%s)
  (( now > deadline )) && fail "Ollama was not ready within ${APP_TIMEOUT}s (raise with --timeout)."
  if (( now - last_note >= 30 )); then
    info "ollama: ${ollama_health%%|*} — downloading/loading model ..."
    last_note=$now
  fi
  sleep 5
done

step "Starting the app"
SERVICES=(app)
$NO_CADDY || SERVICES+=(caddy)
docker compose up -d "${SERVICES[@]}" || fail "docker compose up failed."
success "Containers started: db ollama init ${SERVICES[*]}"

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
echo -e "  Login:  ${BOLD}admin@acmefs.sa${NC} / ${BOLD}${admin_pw:-admin123}${NC}"
echo -e "          (only applies to the first seed; existing data keeps its password)"
echo
echo -e "  Diagnose: ./scripts/doctor.sh     Logs: docker compose logs -f app"
echo -e "  Stop:     docker compose down     Wipe: docker compose down -v"

if $FOLLOW_LOGS; then
  docker compose logs -f
fi

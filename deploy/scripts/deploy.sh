#!/usr/bin/env bash
# =============================================================================
# Identity Radar — Production Deployment Script
#
# Deploys Identity Radar on any Linux VPS in under 10 minutes.
# Usage:
#   ./deploy/scripts/deploy.sh --domain idr.example.com
#   ./deploy/scripts/deploy.sh --domain idr.example.com --seed --ai-provider anthropic --anthropic-key sk-...
#
# Requirements: Docker 20+, Docker Compose v2, ports 80/443 available, 4GB+ RAM
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DOMAIN="localhost"
ADMIN_EMAIL="admin@example.com"
ORG_NAME="My Organization"
AI_PROVIDER="none"
ANTHROPIC_KEY=""
SEED=false
COMPOSE_FILE="deploy/docker/docker-compose.prod.yml"
ENV_FILE=".env.production"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}━━━ Step $1: $2 ━━━${NC}"; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)        DOMAIN="$2"; shift 2 ;;
    --admin-email)   ADMIN_EMAIL="$2"; shift 2 ;;
    --org-name)      ORG_NAME="$2"; shift 2 ;;
    --ai-provider)   AI_PROVIDER="$2"; shift 2 ;;
    --anthropic-key) ANTHROPIC_KEY="$2"; shift 2 ;;
    --seed)          SEED=true; shift ;;
    --help|-h)
      echo "Usage: ./deploy/scripts/deploy.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --domain <fqdn>        Domain for HTTPS (default: localhost)"
      echo "  --admin-email, --org-name  Ignored (kept for compatibility); the first account"
      echo "                         created at /signup becomes the organization admin"
      echo "  --ai-provider <type>   AI backend: ollama, anthropic, none (default: none)"
      echo "  --anthropic-key <key>  Anthropic API key (required if ai-provider=anthropic)"
      echo "  --seed                 Load the Acme demo data (empty database only)"
      echo "  Re-running updates in place and keeps the secrets in .env.production."
      echo "  --help                 Show this help"
      exit 0
      ;;
    *) fail "Unknown option: $1. Use --help for usage." ;;
  esac
done

cd "$PROJECT_DIR"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║      Identity Radar — Production Deploy      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
info "Domain:       ${DOMAIN}"
info "AI Provider:  ${AI_PROVIDER}"
info "Seed Data:    ${SEED}"
echo ""

# =============================================================================
# Step 1: Validate prerequisites
# =============================================================================
step "1/9" "Validating prerequisites"

command -v docker >/dev/null 2>&1 || fail "Docker is required. Install: https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || fail "Docker daemon is not running. Start it with: sudo systemctl start docker"

# Check Docker Compose v2
if docker compose version >/dev/null 2>&1; then
  COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
  success "Docker Compose ${COMPOSE_VERSION}"
else
  fail "Docker Compose v2 is required. Install: https://docs.docker.com/compose/install/"
fi

# Check Docker version (need 20+)
DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0.0.0")
DOCKER_MAJOR=$(echo "$DOCKER_VERSION" | cut -d. -f1)
if [ "$DOCKER_MAJOR" -lt 20 ]; then
  fail "Docker 20+ required. Found: ${DOCKER_VERSION}"
fi
success "Docker ${DOCKER_VERSION}"

# Check available RAM (need 4GB+)
if command -v free >/dev/null 2>&1; then
  TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
  if [ "$TOTAL_RAM_MB" -lt 3500 ]; then
    warn "Only ${TOTAL_RAM_MB}MB RAM available. Recommended: 4096MB+"
  else
    success "RAM: ${TOTAL_RAM_MB}MB"
  fi
fi

# Check ports 80 and 443 (skipped when our own Caddy holds them: a re-run/update)
OWN_CADDY=false
docker ps --format '{{.Names}}' 2>/dev/null | grep -qx idr-caddy && OWN_CADDY=true
for PORT in 80 443; do
  $OWN_CADDY && break
  if ss -tlnp 2>/dev/null | grep -q ":${PORT} " || netstat -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    fail "Port ${PORT} is already in use. Stop the conflicting service first."
  fi
done
$OWN_CADDY && success "Ports 80/443 held by the existing idr-caddy (update in place)" || success "Ports 80 and 443 are available"

# Check required files exist
[ -f "$COMPOSE_FILE" ] || fail "Missing: ${COMPOSE_FILE}. Are you in the project root?"
[ -f "deploy/docker/Dockerfile" ] || fail "Missing: deploy/docker/Dockerfile"
[ -f "deploy/docker/Caddyfile" ] || fail "Missing: deploy/docker/Caddyfile"
[ -f "deploy/docker/backup-loop.sh" ] || fail "Missing: deploy/docker/backup-loop.sh"
[ -f ".env.example" ] || fail "Missing: .env.example"
success "All required files present"

# =============================================================================
# Step 2: Generate secrets
# =============================================================================
step "2/9" "Secrets"

# Re-runs must keep existing secrets: the database volume keeps the password it
# was created with, and CREDENTIALS_KEY decrypts stored connector credentials.
env_get() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r' || true; }
keep_or_new() {  # keep_or_new VAR "generator command"
  local cur; cur="$(env_get "$1")"
  if [ -n "$cur" ]; then printf -v "$1" '%s' "$cur"; success "$1 kept from ${ENV_FILE}"
  else printf -v "$1" '%s' "$(eval "$2")"; success "$1 generated"; fi
}
keep_or_new POSTGRES_PASSWORD "openssl rand -hex 20"
keep_or_new NEXTAUTH_SECRET   "openssl rand -base64 32"
keep_or_new CRON_SECRET       "openssl rand -hex 32"
keep_or_new CREDENTIALS_KEY   "openssl rand -hex 32"
keep_or_new SEED_ADMIN_PASSWORD "openssl rand -hex 8"
# An existing install keeps its demo-data choice unless --seed is given now.
[ "$SEED" = true ] || [ "$(env_get SEED_DEMO)" != "true" ] || SEED=true
[ -f "$ENV_FILE" ] && cp "$ENV_FILE" "${ENV_FILE}.bak" && info "Previous settings saved to ${ENV_FILE}.bak"

# =============================================================================
# Step 3: Create .env.production
# =============================================================================
step "3/9" "Writing ${ENV_FILE}"

if [ "$DOMAIN" = "localhost" ]; then
  APP_URL="http://localhost"
else
  APP_URL="https://${DOMAIN}"
fi

# Build AI configuration
OLLAMA_URL=""
OLLAMA_MODEL="qwen2.5:7b"
AI_PROVIDER_ENV="none"

case "$AI_PROVIDER" in
  ollama)
    AI_PROVIDER_ENV="ollama"
    OLLAMA_URL="http://host.docker.internal:11434"
    info "Ollama AI provider selected — ensure Ollama is running on the host"
    ;;
  anthropic)
    AI_PROVIDER_ENV="anthropic"
    [ -z "$ANTHROPIC_KEY" ] && fail "--anthropic-key is required when ai-provider=anthropic"
    ;;
  none|"")
    AI_PROVIDER_ENV="none"
    ;;
  *)
    fail "Unknown AI provider: ${AI_PROVIDER}. Use: ollama, anthropic, or none"
    ;;
esac

cat > "$ENV_FILE" << EOF
# =============================================================================
# Identity Radar — Production Environment
# Generated by deploy.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# =============================================================================

# --- Database ---
POSTGRES_DB=identity_radar
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/identity_radar

# --- Auth ---
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=${APP_URL}
AUTH_TRUST_HOST=true

# --- Application ---
NEXT_PUBLIC_APP_URL=${APP_URL}
NODE_ENV=production
NEXT_PUBLIC_DEMO_MODE=false

# --- Security (keep these; changing CREDENTIALS_KEY breaks stored connector credentials) ---
CRON_SECRET=${CRON_SECRET}
CREDENTIALS_KEY=${CREDENTIALS_KEY}

# --- Data ---
# true loads the Acme demo organization into an EMPTY database (use --seed)
SEED_DEMO=${SEED}
SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD}

# --- Scheduling and backups ---
SCHEDULE_TZ=${SCHEDULE_TZ:-UTC}
BACKUP_HOUR=${BACKUP_HOUR:-2}
BACKUP_KEEP=${BACKUP_KEEP:-14}

# --- AI Provider ---
AI_PROVIDER=${AI_PROVIDER_ENV}
OLLAMA_URL=${OLLAMA_URL}
OLLAMA_MODEL=${OLLAMA_MODEL}
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}

# --- Domain (for Caddy HTTPS) ---
DOMAIN=${DOMAIN}
EOF

chmod 600 "$ENV_FILE" 2>/dev/null || true
success "Wrote ${ENV_FILE}"

# =============================================================================
# Step 4: Build Docker image
# =============================================================================
step "4/9" "Building Docker images"

info "This may take 3-5 minutes on first build..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --no-cache init app
success "Docker images built (identity-radar, identity-radar-init)"

# =============================================================================
# Step 5: Start services
# =============================================================================
step "5/9" "Starting services (PostgreSQL, init, App, scheduler, backup, Caddy)"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
success "All containers started"

# =============================================================================
# Step 6: Wait for healthy
# =============================================================================
step "6/9" "Waiting for services to be healthy"

# Wait for PostgreSQL first
info "Waiting for PostgreSQL..."
MAX_WAIT=60
ELAPSED=0
until docker exec idr-db pg_isready -U postgres -q 2>/dev/null; do
  ELAPSED=$((ELAPSED + 2))
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    fail "PostgreSQL did not become ready within ${MAX_WAIT}s"
  fi
  sleep 2
done
success "PostgreSQL is ready"

# Wait for the app
info "Waiting for Identity Radar app..."
MAX_WAIT=120
ELAPSED=0
until curl -sf http://localhost:3000/api/health >/dev/null 2>&1; do
  ELAPSED=$((ELAPSED + 3))
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    warn "App not healthy after ${MAX_WAIT}s. Checking logs..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=30 app
    fail "Application failed to start. Check logs above."
  fi
  sleep 3
done
success "Application is healthy"

# =============================================================================
# Step 7: Run database migrations
# =============================================================================
step "7/9" "Database schema"

# The init container pushes the schema and views before the app starts.
INIT_STATE="$(docker inspect -f '{{.State.Status}}|{{.State.ExitCode}}' idr-init 2>/dev/null || echo missing)"
if [ "$INIT_STATE" = "exited|0" ]; then
  success "Schema and views applied (idr-init)"
else
  docker logs --tail 30 idr-init 2>&1 || true
  fail "Database initialisation did not complete (${INIT_STATE}). See the log above."
fi

# =============================================================================
# Step 8: Seed data (optional)
# =============================================================================
step "8/9" "Data initialization"

if [ "$SEED" = true ]; then
  docker logs idr-init 2>&1 | grep -E "Seed complete|Skipping seed" | tail -n1 | sed 's/^/        /' || true
  success "Demo data: loaded into an empty database (existing data is never overwritten)"
else
  success "No demo data loaded (production). Create the first account at ${APP_URL}/signup"
fi
docker ps --format '{{.Names}}' | grep -qx idr-scheduler && success "Scheduler running: scans start now and repeat on schedule" || warn "Scheduler is not running: docker logs idr-scheduler"
docker ps --format '{{.Names}}' | grep -qx idr-backup && success "Daily backups to deploy/docker/backups/" || warn "Backup container is not running: docker logs idr-backup"

# =============================================================================
# Step 9: Done
# =============================================================================
step "9/9" "Deployment complete"

# Get health status
HEALTH=$(curl -sf http://localhost:3000/api/health 2>/dev/null || echo '{"status":"unknown"}')
STATUS=$(echo "$HEALTH" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       Identity Radar is running!             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
info "URL:              ${APP_URL}"
info "Health Status:    ${STATUS}"
if [ "$SEED" = true ]; then
  info "Demo login:       admin@acmefs.sa / ${SEED_ADMIN_PASSWORD} (first seed only)"
else
  info "First admin:      open ${APP_URL}/signup; the first account becomes the organization admin"
fi
info "Backups:          deploy/docker/backups/ (restore: ./deploy/scripts/restore.sh <file>)"
info "Scan log:         docker logs idr-scheduler"
echo ""
info "Env file:         ${ENV_FILE}"
info "Compose file:     ${COMPOSE_FILE}"
echo ""
echo -e "${YELLOW}Management commands:${NC}"
echo "  Status:   docker compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} ps"
echo "  Logs:     docker compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} logs -f"
echo "  Stop:     docker compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} down"
echo "  Restart:  docker compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} restart"
echo "  Backup:   automatic daily (deploy/docker/backups/); on demand: ./deploy/scripts/backup.sh"
echo ""
echo -e "${GREEN}Deployment complete.${NC}"

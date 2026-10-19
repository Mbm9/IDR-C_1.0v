#!/usr/bin/env bash
# =============================================================================
# Identity Radar — Offline Bundle Builder
#
# Run this on a machine WITH internet to create a complete offline package.
# The output is a folder that can be copied to USB / transferred to an
# air-gapped machine.
#
# Usage:
#   ./scripts/bundle-offline.sh                    # Default: qwen2.5:1.5b (fast, 1GB)
#   ./scripts/bundle-offline.sh --model qwen2.5:7b # Larger model (better quality, 4.7GB)
#
# Output: ./identity-radar-offline/ (~2-6 GB depending on model)
# =============================================================================
set -euo pipefail

MODEL="${1:-qwen2.5:1.5b}"
BUNDLE_DIR="identity-radar-offline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Identity Radar — Offline Bundle Builder     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "Docker is required"
command -v ollama >/dev/null 2>&1 || fail "Ollama is required. Install: curl -fsSL https://ollama.com/install.sh | sh"
docker info >/dev/null 2>&1 || fail "Docker daemon is not running"

# ---------------------------------------------------------------------------
# Step 1: Pull required Docker images
# ---------------------------------------------------------------------------
info "Step 1/5: Pulling Docker images..."
docker pull postgres:16-alpine
docker pull caddy:2-alpine
docker pull node:20-alpine
success "Docker images pulled"

# ---------------------------------------------------------------------------
# Step 2: Pull AI model via Ollama
# ---------------------------------------------------------------------------
info "Step 2/5: Pulling AI model: ${MODEL}..."
ollama pull "$MODEL"
success "Model ${MODEL} pulled"

# ---------------------------------------------------------------------------
# Step 3: Build the Identity Radar image
# ---------------------------------------------------------------------------
info "Step 3/5: Building Identity Radar Docker image..."
cd "$PROJECT_DIR"
# Two targets: the web app (also runs the scheduler) and the one-shot database init.
docker build -f docker/Dockerfile --target runner -t identity-radar:latest .
docker build -f docker/Dockerfile --target init -t identity-radar-init:latest .
success "Identity Radar images built (identity-radar, identity-radar-init)"

# ---------------------------------------------------------------------------
# Step 4: Create the bundle directory
# ---------------------------------------------------------------------------
info "Step 4/5: Creating offline bundle..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/images"
mkdir -p "$BUNDLE_DIR/model"
mkdir -p "$BUNDLE_DIR/scripts"
mkdir -p "$BUNDLE_DIR/config"

# Save Docker images as tarballs
info "  Saving identity-radar image..."
docker save identity-radar:latest | gzip > "$BUNDLE_DIR/images/identity-radar.tar.gz"
info "  Saving identity-radar-init image..."
docker save identity-radar-init:latest | gzip > "$BUNDLE_DIR/images/identity-radar-init.tar.gz"

info "  Saving postgres image..."
docker save postgres:16-alpine | gzip > "$BUNDLE_DIR/images/postgres-16-alpine.tar.gz"

info "  Saving caddy image..."
docker save caddy:2-alpine | gzip > "$BUNDLE_DIR/images/caddy-2-alpine.tar.gz"

# Copy Ollama model files
info "  Copying AI model files..."
OLLAMA_MODELS_DIR="${OLLAMA_MODELS:-$HOME/.ollama/models}"
if [ -d "$OLLAMA_MODELS_DIR" ]; then
  cp -r "$OLLAMA_MODELS_DIR" "$BUNDLE_DIR/model/ollama-models"
  success "Model files copied"
else
  # Try macOS path
  OLLAMA_MODELS_DIR="$HOME/.ollama/models"
  if [ -d "$OLLAMA_MODELS_DIR" ]; then
    cp -r "$OLLAMA_MODELS_DIR" "$BUNDLE_DIR/model/ollama-models"
    success "Model files copied"
  else
    echo "  Warning: Could not find Ollama models directory. You'll need to copy manually."
  fi
fi

# Copy config files
cp "$PROJECT_DIR/docker/docker-compose.prod.yml" "$BUNDLE_DIR/config/"
cp "$PROJECT_DIR/docker/Caddyfile" "$BUNDLE_DIR/config/"
cp "$PROJECT_DIR/docker/backup-loop.sh" "$BUNDLE_DIR/config/"
cp "$PROJECT_DIR/.env.example" "$BUNDLE_DIR/config/"

# Copy deployment scripts
cp "$PROJECT_DIR/scripts/backup.sh" "$BUNDLE_DIR/scripts/"
cp "$PROJECT_DIR/scripts/restore.sh" "$BUNDLE_DIR/scripts/"

# ---------------------------------------------------------------------------
# Step 5: Create the offline install script
# ---------------------------------------------------------------------------
cat > "$BUNDLE_DIR/install.sh" << 'INSTALL_EOF'
#!/usr/bin/env bash
# =============================================================================
# Identity Radar — Offline Installer
# Run this on the TARGET machine (no internet required)
# =============================================================================
set -euo pipefail

DOMAIN="${1:-localhost}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Identity Radar — Offline Installation       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
info "Domain: ${DOMAIN}"
echo ""

# Check Docker
command -v docker >/dev/null 2>&1 || fail "Docker is required. Install Docker Desktop or Docker Engine first."
docker info >/dev/null 2>&1 || fail "Docker daemon is not running."

# Step 1: Load Docker images
info "Step 1/6: Loading Docker images..."
for img in "$SCRIPT_DIR"/images/*.tar.gz; do
  info "  Loading $(basename "$img")..."
  gunzip -c "$img" | docker load
done
success "All images loaded"

# Step 2: Install Ollama (if not installed)
info "Step 2/6: Checking Ollama..."
if ! command -v ollama >/dev/null 2>&1; then
  info "  Ollama not found. Please install Ollama first:"
  echo ""
  echo "  Linux:   curl -fsSL https://ollama.com/install.sh | sh"
  echo "  macOS:   brew install ollama"
  echo "  Windows: Download from https://ollama.com/download"
  echo ""
  echo "  After installing, re-run this script."
  exit 1
fi
success "Ollama is installed"

# Step 3: Copy AI model
info "Step 3/6: Installing AI model..."
if [ -d "$SCRIPT_DIR/model/ollama-models" ]; then
  OLLAMA_TARGET="${HOME}/.ollama/models"
  mkdir -p "$OLLAMA_TARGET"
  cp -r "$SCRIPT_DIR/model/ollama-models/"* "$OLLAMA_TARGET/"
  success "AI model installed"
else
  echo "  Warning: No model files found in bundle. You'll need to pull manually: ollama pull qwen2.5:1.5b"
fi

# Step 4: Create install directory
INSTALL_DIR="/opt/identity-radar"
info "Step 4/6: Setting up ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/config/docker-compose.prod.yml" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/config/Caddyfile" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/config/backup-loop.sh" "$INSTALL_DIR/"
mkdir -p "$INSTALL_DIR/backups"
cp -r "$SCRIPT_DIR/scripts/"* "$INSTALL_DIR/" 2>/dev/null || true
chmod +x "$INSTALL_DIR/"*.sh 2>/dev/null || true

# Step 5: Generate config
info "Step 5/6: Generating configuration..."
# Re-installs keep existing secrets (the database keeps its original password,
# and CREDENTIALS_KEY decrypts stored connector credentials).
ENV_PROD="$INSTALL_DIR/.env.production"
env_get() { [ -f "$ENV_PROD" ] && grep -E "^$1=" "$ENV_PROD" | tail -n1 | cut -d= -f2- || true; }
POSTGRES_PASSWORD="$(env_get POSTGRES_PASSWORD)"; [ -n "$POSTGRES_PASSWORD" ] || POSTGRES_PASSWORD=$(openssl rand -hex 20)
NEXTAUTH_SECRET="$(env_get NEXTAUTH_SECRET)";     [ -n "$NEXTAUTH_SECRET" ]   || NEXTAUTH_SECRET=$(openssl rand -base64 32)
CRON_SECRET="$(env_get CRON_SECRET)";             [ -n "$CRON_SECRET" ]       || CRON_SECRET=$(openssl rand -hex 32)
CREDENTIALS_KEY="$(env_get CREDENTIALS_KEY)";     [ -n "$CREDENTIALS_KEY" ]   || CREDENTIALS_KEY=$(openssl rand -hex 32)
[ -f "$ENV_PROD" ] && cp "$ENV_PROD" "$ENV_PROD.bak"

if [ "$DOMAIN" = "localhost" ]; then
  APP_URL="http://localhost"
else
  APP_URL="https://${DOMAIN}"
fi

cat > "$INSTALL_DIR/.env.production" << EOF
# Identity Radar — Production Environment (Offline)
POSTGRES_DB=identity_radar
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/identity_radar
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=${APP_URL}
AUTH_TRUST_HOST=true
NEXT_PUBLIC_APP_URL=${APP_URL}
NODE_ENV=production
DOMAIN=${DOMAIN}
NEXT_PUBLIC_DEMO_MODE=false
CRON_SECRET=${CRON_SECRET}
CREDENTIALS_KEY=${CREDENTIALS_KEY}
SEED_DEMO=false
SCHEDULE_TZ=UTC
BACKUP_HOUR=2
BACKUP_KEEP=14
AI_PROVIDER=ollama
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:1.5b
EOF
chmod 600 "$ENV_PROD"
success "Configuration generated"

# Step 6: Start services
info "Step 6/6: Starting Identity Radar..."

# Start Ollama in background
ollama serve &>/dev/null &
sleep 3

cd "$INSTALL_DIR"
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-build

# Wait for health
info "Waiting for services to start..."
MAX_WAIT=120
ELAPSED=0
until curl -sf http://localhost:3000/api/health >/dev/null 2>&1; do
  ELAPSED=$((ELAPSED + 3))
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo ""
    echo "  App is taking longer than expected."
    echo "  Check: docker compose --env-file .env.production -f docker-compose.prod.yml logs app"
    break
  fi
  sleep 3
done

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       Identity Radar is running!             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
info "URL:              ${APP_URL}"
info "First admin:      open ${APP_URL}/signup; the first account becomes the admin"
info "Scans:            run on schedule by idr-scheduler; backups daily to ${INSTALL_DIR}/backups"
info "AI Model:         qwen2.5:1.5b (running locally)"
echo ""
info "Management:"
echo "  Status:   docker compose --env-file .env.production -f docker-compose.prod.yml ps"
echo "  Stop:     docker compose --env-file .env.production -f docker-compose.prod.yml down"
echo "  Logs:     docker compose --env-file .env.production -f docker-compose.prod.yml logs -f"
echo "  Backup:   ./backup.sh"
echo ""
INSTALL_EOF

chmod +x "$BUNDLE_DIR/install.sh"

# ---------------------------------------------------------------------------
# Step 5: Create README
# ---------------------------------------------------------------------------
cat > "$BUNDLE_DIR/README.txt" << 'README_EOF'
================================================================================
  Identity Radar — Offline Installation Package
================================================================================

CONTENTS:
  images/             Docker images (Identity Radar, PostgreSQL, Caddy)
  model/              AI model files (Ollama)
  config/             Configuration templates
  scripts/            Management scripts (backup, restore)
  install.sh          Installation script

PREREQUISITES:
  - Linux (Ubuntu 22.04+), macOS, or Windows with WSL2
  - Docker Desktop or Docker Engine installed
  - Ollama installed (https://ollama.com)
  - 8 GB RAM minimum (16 GB recommended)
  - 10 GB free disk space

INSTALLATION:
  1. Copy this entire folder to the target machine
  2. Open a terminal in this folder
  3. Run:

     chmod +x install.sh
     ./install.sh

     Or with a custom domain:

     ./install.sh identityradar.company.com

  4. Open http://localhost:3000 in your browser
  5. Create the first account at /signup (it becomes the organization admin)
  6. Go to "Import Data" to upload your AD data

NO INTERNET REQUIRED:
  Everything runs locally. No data leaves the machine.
  The AI model runs on CPU — no GPU required.

IMPORTING YOUR DATA:
  On your Domain Controller, run these PowerShell commands:

  Command 1 (Users):
    Get-ADUser -Filter * -Properties * | Export-Csv ir-users.csv -NoTypeInformation

  Command 2 (Groups):
    Get-ADGroup -Filter * -Properties Members | Export-Csv ir-groups.csv -NoTypeInformation

  Then upload both files in Identity Radar → Import Data

MANAGEMENT:
  Start:    cd /opt/identity-radar && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-build
  Stop:     cd /opt/identity-radar && docker compose --env-file .env.production -f docker-compose.prod.yml down
  Backup:   cd /opt/identity-radar && ./backup.sh
  Restore:  cd /opt/identity-radar && ./restore.sh backups/<file>.sql.gz

SUPPORT:
  https://github.com/ASHS21/IDR-C/issues
================================================================================
README_EOF

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
BUNDLE_SIZE=$(du -sh "$BUNDLE_DIR" | cut -f1)

echo ""
success "Offline bundle created!"
echo ""
info "Location:  ${PROJECT_DIR}/${BUNDLE_DIR}/"
info "Size:      ${BUNDLE_SIZE}"
info "AI Model:  ${MODEL}"
echo ""
info "Contents:"
ls -lh "$BUNDLE_DIR/images/"
echo ""
info "Next steps:"
echo "  1. Copy the '${BUNDLE_DIR}' folder to a USB drive or transfer to the target machine"
echo "  2. On the target machine: cd ${BUNDLE_DIR} && ./install.sh"
echo "  3. Open http://localhost:3000"
echo ""

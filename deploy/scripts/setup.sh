#!/usr/bin/env bash
# =============================================================================
# Identity Radar — First-Time Setup Script
#
# This script:
#   1. Checks prerequisites (Docker, Node.js)
#   2. Copies .env.example → .env.local (with generated secrets)
#   3. Installs Node dependencies
#   4. Starts PostgreSQL via Docker Compose
#   5. Pushes the Drizzle schema & creates views
#   6. Seeds sample data
#   7. Prints access URL and default credentials
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ---------------------------------------------------------------------------
# 1. Check prerequisites
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo "  Identity Radar — Setup"
echo "============================================"
echo ""

info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || fail "Docker is required. Install from https://docker.com"
command -v node   >/dev/null 2>&1 || fail "Node.js is required. Install from https://nodejs.org"
command -v npm    >/dev/null 2>&1 || fail "npm is required (should come with Node.js)"

# Verify Docker daemon is running
docker info >/dev/null 2>&1 || fail "Docker daemon is not running. Please start Docker."

NODE_VERSION=$(node -v)
success "Node.js ${NODE_VERSION}"
success "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ---------------------------------------------------------------------------
# 2. Create .env.local with generated secrets
# ---------------------------------------------------------------------------
echo ""
info "Setting up environment..."

if [ ! -f .env.local ]; then
  cp .env.example .env.local

  # Generate a cryptographically random NEXTAUTH_SECRET
  GENERATED_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  # Generate a random PostgreSQL password
  GENERATED_PG_PASS=$(openssl rand -base64 16 2>/dev/null || head -c 16 /dev/urandom | base64)

  # Replace placeholder values
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS sed
    sed -i '' "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${GENERATED_SECRET}|" .env.local
    sed -i '' "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${GENERATED_PG_PASS}|" .env.local
    sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:${GENERATED_PG_PASS}@localhost:5432/identity_radar|" .env.local
  else
    # Linux sed
    sed -i "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${GENERATED_SECRET}|" .env.local
    sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${GENERATED_PG_PASS}|" .env.local
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:${GENERATED_PG_PASS}@localhost:5432/identity_radar|" .env.local
  fi

  success "Created .env.local with generated secrets"
else
  warn ".env.local already exists — skipping"
fi

# ---------------------------------------------------------------------------
# 3. Install Node dependencies
# ---------------------------------------------------------------------------
echo ""
info "Installing Node.js dependencies..."
npm install --silent
success "Dependencies installed"

# ---------------------------------------------------------------------------
# 4. Start PostgreSQL
# ---------------------------------------------------------------------------
echo ""
info "Starting PostgreSQL via Docker Compose..."
docker compose up -d
success "PostgreSQL container started"

# Wait for database to be ready
info "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
until docker exec identity-radar-db pg_isready -U postgres -q 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    fail "PostgreSQL did not become ready within ${MAX_RETRIES} seconds"
  fi
  sleep 1
done
success "PostgreSQL is ready"

# ---------------------------------------------------------------------------
# 5. Push Drizzle schema + create views
# ---------------------------------------------------------------------------
echo ""
info "Pushing database schema..."
npm run db:push
success "Database schema applied"

# Apply views if the SQL file exists
if [ -f drizzle/0001_create_views.sql ]; then
  info "Creating database views..."
  docker exec -i identity-radar-db psql -U postgres -d identity_radar < drizzle/0001_create_views.sql
  success "Database views created"
fi

# ---------------------------------------------------------------------------
# 6. Seed sample data
# ---------------------------------------------------------------------------
echo ""
info "Seeding sample data..."
npm run db:seed
success "Sample data seeded"

# ---------------------------------------------------------------------------
# 7. Done
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
info "Start the dev server:  npm run dev"
echo ""
info "Application URL:       http://localhost:3000"
info "Default credentials:   admin@acmefs.sa / admin123"
echo ""
info "For production deployment, see deploy/docker/docker-compose.prod.yml"
echo ""

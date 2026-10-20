# =============================================================================
# Identity Radar - Upgrade Script
# =============================================================================

param(
    [string]$InstallDir = "C:\Program Files\IdentityRadar"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Identity Radar - Upgrade" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "$InstallDir\docker-compose.yml")) {
    Write-Host "ERROR: Identity Radar not found at $InstallDir" -ForegroundColor Red
    exit 1
}

Set-Location $InstallDir

# ---------------------------------------------------------------------------
# Step 1: Get current version
# ---------------------------------------------------------------------------

Write-Host "Checking current version..." -ForegroundColor Yellow

$oldVersion = "unknown"
try {
    $healthResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
    if ($healthResponse.StatusCode -eq 200) {
        $health = $healthResponse.Content | ConvertFrom-Json
        $oldVersion = $health.version
    }
}
catch {
    Write-Host "  Could not determine current version (services may be stopped)" -ForegroundColor Yellow
}

Write-Host "  Current version: $oldVersion" -ForegroundColor Gray

# ---------------------------------------------------------------------------
# Step 2: Backup database
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Backing up database before upgrade..." -ForegroundColor Yellow

$exportScript = "$InstallDir\scripts\export-data.ps1"
if (Test-Path $exportScript) {
    & powershell -ExecutionPolicy Bypass -File $exportScript -InstallDir $InstallDir
}
else {
    # Inline backup
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = "$InstallDir\backups"
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    }
    $backupFile = "$backupDir\identity-radar-pre-upgrade-$timestamp.sql"
    & docker compose exec -T db pg_dump -U postgres identity_radar > $backupFile 2>&1
    Write-Host "  Backup saved to $backupFile" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Step 3: Pull latest images
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Pulling latest images..." -ForegroundColor Yellow

& docker compose pull 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

# ---------------------------------------------------------------------------
# Step 4: Restart services
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Restarting services with new images..." -ForegroundColor Yellow

& docker compose up -d 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

# ---------------------------------------------------------------------------
# Step 5: Run database migrations
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Running database migrations..." -ForegroundColor Yellow

try {
    & docker compose exec app npm run db:push 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "  Migrations applied - OK" -ForegroundColor Green
}
catch {
    Write-Host "  WARNING: Migration may have failed. Check logs." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 6: Wait for health check
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Waiting for services to be healthy..." -ForegroundColor Yellow

$maxWait = 120
$elapsed = 0
$healthy = $false

while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 5
    $elapsed += 5
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    }
    catch {
        # Still waiting
    }
}

# ---------------------------------------------------------------------------
# Step 7: Report
# ---------------------------------------------------------------------------

Write-Host ""

if ($healthy) {
    $newVersion = "unknown"
    try {
        $healthResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
        $health = $healthResponse.Content | ConvertFrom-Json
        $newVersion = $health.version
    }
    catch {
        # Could not get version
    }

    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  Upgrade Complete!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Previous version: $oldVersion" -ForegroundColor Gray
    Write-Host "  Current version:  $newVersion" -ForegroundColor Green
}
else {
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  Upgrade Completed (health check pending)" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Services may still be starting. Check:" -ForegroundColor Yellow
    Write-Host "    docker compose logs -f" -ForegroundColor White
}

Write-Host ""

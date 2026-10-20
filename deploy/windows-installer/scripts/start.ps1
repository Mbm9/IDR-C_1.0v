# =============================================================================
# Identity Radar - Start Services
# =============================================================================

param(
    [string]$InstallDir = "C:\Program Files\IdentityRadar"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Starting Identity Radar..." -ForegroundColor Cyan

if (-not (Test-Path "$InstallDir\docker-compose.yml")) {
    Write-Host "ERROR: docker-compose.yml not found in $InstallDir" -ForegroundColor Red
    Write-Host "Is Identity Radar installed?" -ForegroundColor Red
    exit 1
}

Set-Location $InstallDir
& docker compose up -d

$timeout = 30
$elapsed = 0
$healthy = $false

Write-Host "Waiting for services to start..." -ForegroundColor Yellow

while ($elapsed -lt $timeout) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    }
    catch {
        # Still starting
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
}

if ($healthy) {
    Start-Process "http://localhost:3000"
    Write-Host ""
    Write-Host "Identity Radar is running at http://localhost:3000" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "Services are starting but health check has not passed yet." -ForegroundColor Yellow
    Write-Host "Check status with: docker compose ps" -ForegroundColor Yellow
}

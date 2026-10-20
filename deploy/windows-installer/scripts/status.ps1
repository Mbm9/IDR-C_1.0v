# =============================================================================
# Identity Radar - Status Check
# =============================================================================

param(
    [string]$InstallDir = "C:\Program Files\IdentityRadar"
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Identity Radar - Status" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# Container Status
# ---------------------------------------------------------------------------

Write-Host "Container Status:" -ForegroundColor Yellow
Write-Host "-----------------"

if (Test-Path "$InstallDir\docker-compose.yml") {
    Set-Location $InstallDir
    $composeOutput = & docker compose ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        $composeOutput | ForEach-Object { Write-Host "  $_" }
    }
    else {
        Write-Host "  Could not get container status. Is Docker running?" -ForegroundColor Red
    }
}
else {
    Write-Host "  Identity Radar does not appear to be installed at $InstallDir" -ForegroundColor Red
}

Write-Host ""

# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

Write-Host "Health Check:" -ForegroundColor Yellow
Write-Host "-------------"

try {
    $healthResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
    if ($healthResponse.StatusCode -eq 200) {
        $health = $healthResponse.Content | ConvertFrom-Json
        Write-Host "  Status:    $($health.status)" -ForegroundColor Green
        Write-Host "  Version:   $($health.version)"
        Write-Host "  Uptime:    $($health.uptime) seconds"

        if ($health.checks.database) {
            $dbColor = "Green"
            if ($health.checks.database.status -ne "up") { $dbColor = "Red" }
            Write-Host "  Database:  $($health.checks.database.status) ($($health.checks.database.latencyMs)ms)" -ForegroundColor $dbColor
        }

        if ($health.checks.ai) {
            $aiColor = "Green"
            if ($health.checks.ai.status -eq "down") { $aiColor = "Red" }
            if ($health.checks.ai.status -eq "unconfigured") { $aiColor = "Yellow" }
            $aiProvider = ""
            if ($health.checks.ai.provider) { $aiProvider = " ($($health.checks.ai.provider))" }
            Write-Host "  AI Engine: $($health.checks.ai.status)$aiProvider" -ForegroundColor $aiColor
        }
    }
}
catch {
    Write-Host "  Application is not responding at http://localhost:3000" -ForegroundColor Red
}

Write-Host ""

# ---------------------------------------------------------------------------
# URL
# ---------------------------------------------------------------------------

Write-Host "Access:" -ForegroundColor Yellow
Write-Host "-------"
Write-Host "  URL: http://localhost:3000"
Write-Host ""

# ---------------------------------------------------------------------------
# Disk Usage
# ---------------------------------------------------------------------------

Write-Host "Docker Volume Disk Usage:" -ForegroundColor Yellow
Write-Host "-------------------------"

try {
    $volumes = & docker volume ls --format "{{.Name}}" 2>&1
    if ($LASTEXITCODE -eq 0) {
        $volumes | Where-Object { $_ -match "identityradar" -or $_ -match "idr" } | ForEach-Object {
            $volumeName = $_
            $inspectOutput = & docker volume inspect $volumeName --format "{{.Mountpoint}}" 2>&1
            Write-Host "  $volumeName"
        }
    }

    $systemDf = & docker system df -v 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Docker Disk Summary:" -ForegroundColor Yellow
        Write-Host "--------------------"
        $systemDf | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" }
    }
}
catch {
    Write-Host "  Could not retrieve volume information" -ForegroundColor Yellow
}

Write-Host ""

# ---------------------------------------------------------------------------
# AI Model
# ---------------------------------------------------------------------------

Write-Host "AI Model Status:" -ForegroundColor Yellow
Write-Host "----------------"

try {
    $modelList = & docker model list 2>&1
    if ($LASTEXITCODE -eq 0) {
        $modelList | ForEach-Object { Write-Host "  $_" }
    }
    else {
        Write-Host "  Docker Model Runner may not be enabled" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "  Could not check AI model status" -ForegroundColor Yellow
}

Write-Host ""

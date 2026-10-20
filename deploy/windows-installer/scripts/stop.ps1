# =============================================================================
# Identity Radar - Stop Services
# =============================================================================

param(
    [string]$InstallDir = "C:\Program Files\IdentityRadar"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Stopping Identity Radar..." -ForegroundColor Cyan

if (-not (Test-Path "$InstallDir\docker-compose.yml")) {
    Write-Host "ERROR: docker-compose.yml not found in $InstallDir" -ForegroundColor Red
    exit 1
}

Set-Location $InstallDir
& docker compose down

Write-Host ""
Write-Host "Identity Radar stopped." -ForegroundColor Green

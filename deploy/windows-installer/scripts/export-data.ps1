# =============================================================================
# Identity Radar - Export / Backup Database
# =============================================================================

param(
    [string]$InstallDir = "C:\Program Files\IdentityRadar"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "$InstallDir\docker-compose.yml")) {
    Write-Host "ERROR: Identity Radar not found at $InstallDir" -ForegroundColor Red
    exit 1
}

Set-Location $InstallDir

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "$InstallDir\backups"
$backupFile = "$backupDir\identity-radar-$timestamp.sql"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
}

Write-Host "Exporting database..." -ForegroundColor Cyan

try {
    & docker compose exec -T db pg_dump -U postgres identity_radar > $backupFile 2>&1
    $fileSize = (Get-Item $backupFile).Length
    $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
    Write-Host "Backup saved to $backupFile ($fileSizeMB MB)" -ForegroundColor Green
}
catch {
    Write-Host "ERROR: Failed to export database: $_" -ForegroundColor Red
    exit 1
}

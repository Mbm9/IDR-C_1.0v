# =============================================================================
# Identity Radar - Uninstall Script
# =============================================================================

param(
    [string]$InstallDir = "C:\Program Files\IdentityRadar"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host "  Identity Radar - Uninstall" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red
Write-Host ""
Write-Host "  WARNING: This will remove Identity Radar and ALL DATA." -ForegroundColor Red
Write-Host "  This action cannot be undone." -ForegroundColor Red
Write-Host ""

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------

$confirmation = Read-Host "  Type DELETE to confirm removal of Identity Radar and ALL DATA"

if ($confirmation -ne "DELETE") {
    Write-Host ""
    Write-Host "  Uninstall cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""

# ---------------------------------------------------------------------------
# Step 1: Stop and remove containers and volumes
# ---------------------------------------------------------------------------

Write-Host "Stopping services and removing data..." -ForegroundColor Yellow

if (Test-Path "$InstallDir\docker-compose.yml") {
    Set-Location $InstallDir
    try {
        & docker compose down -v 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        Write-Host "  Containers and volumes removed." -ForegroundColor Green
    }
    catch {
        Write-Host "  WARNING: Could not stop containers. They may not be running." -ForegroundColor Yellow
    }
}
else {
    Write-Host "  No docker-compose.yml found. Skipping container removal." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 2: Optionally remove Docker images
# ---------------------------------------------------------------------------

Write-Host ""
$removeImages = Read-Host "Remove Docker images (postgres, identity-radar, caddy)? (y/N)"

if ($removeImages -eq "y" -or $removeImages -eq "Y") {
    Write-Host "Removing Docker images..." -ForegroundColor Yellow
    $imagesToRemove = @("postgres:16-alpine", "caddy:2-alpine")

    # Find identity-radar images
    try {
        $idrImages = & docker images --format "{{.Repository}}:{{.Tag}}" 2>&1
        $idrImages | Where-Object { $_ -match "identity-radar" } | ForEach-Object {
            $imagesToRemove += $_
        }
    }
    catch {
        # Ignore
    }

    foreach ($img in $imagesToRemove) {
        try {
            & docker rmi $img 2>&1 | Out-Null
            Write-Host "  Removed: $img" -ForegroundColor Gray
        }
        catch {
            Write-Host "  Could not remove: $img (may be in use by other containers)" -ForegroundColor Yellow
        }
    }
}

# ---------------------------------------------------------------------------
# Step 3: Optionally remove AI model
# ---------------------------------------------------------------------------

Write-Host ""
$removeModel = Read-Host "Remove AI model (ai/qwen3.5:35B-Q4_K_M)? (y/N)"

if ($removeModel -eq "y" -or $removeModel -eq "Y") {
    Write-Host "Removing AI model..." -ForegroundColor Yellow
    try {
        & docker model rm ai/qwen3.5:35B-Q4_K_M 2>&1 | Out-Null
        Write-Host "  AI model removed." -ForegroundColor Green
    }
    catch {
        Write-Host "  Could not remove AI model." -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# Step 4: Remove install directory contents
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Removing installation files..." -ForegroundColor Yellow

# Move out of install dir before removing
Set-Location $env:USERPROFILE

try {
    # Remove contents but keep the directory (Inno Setup may need it for its own uninstall)
    Get-ChildItem -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Installation files removed." -ForegroundColor Green
}
catch {
    Write-Host "  WARNING: Some files could not be removed. You may need to delete $InstallDir manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Identity Radar has been uninstalled." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Note: Docker Desktop has NOT been removed." -ForegroundColor Gray
Write-Host "  If you no longer need Docker, uninstall it separately." -ForegroundColor Gray
Write-Host ""

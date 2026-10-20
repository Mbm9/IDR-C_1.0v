# =============================================================================
# Identity Radar - Build Air-Gap USB Package
# Creates a self-contained USB directory with all required images and scripts
# =============================================================================

param(
    [string]$USBDir = ".\airgap-usb"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Identity Radar - Air-Gap USB Builder" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---------------------------------------------------------------------------
# Step 1: Create USB directory structure
# ---------------------------------------------------------------------------

Write-Host "Creating USB directory structure..." -ForegroundColor Yellow

$dirs = @(
    "$USBDir",
    "$USBDir\images",
    "$USBDir\scripts",
    "$USBDir\config"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

Write-Host "  Directory structure created - OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 2: Save Docker images
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Saving Docker images (this will take a while)..." -ForegroundColor Yellow

$images = @(
    @{ Name = "postgres:16-alpine"; File = "postgres.tar" },
    @{ Name = "caddy:2-alpine"; File = "caddy.tar" }
)

# Check for identity-radar image
$idrImage = & docker images --format "{{.Repository}}:{{.Tag}}" 2>&1 | Where-Object { $_ -match "identity-radar" } | Select-Object -First 1
if ($idrImage) {
    $images += @{ Name = $idrImage; File = "identity-radar.tar" }
}
else {
    Write-Host "  WARNING: identity-radar image not found locally." -ForegroundColor Yellow
    Write-Host "  Build it first with: docker build -t identity-radar:latest -f deploy/docker/Dockerfile ." -ForegroundColor Yellow

    # Try the ghcr.io image
    $ghcrImage = "ghcr.io/ashs21/identity-radar:latest"
    Write-Host "  Attempting to use $ghcrImage instead..." -ForegroundColor Yellow
    $images += @{ Name = $ghcrImage; File = "identity-radar.tar" }
}

foreach ($img in $images) {
    Write-Host "  Saving $($img.Name)..." -ForegroundColor Gray
    $outFile = Join-Path "$USBDir\images" $img.File

    try {
        & docker save $img.Name -o $outFile
        $sizeMB = [math]::Round((Get-Item $outFile).Length / 1MB, 1)
        Write-Host "    Saved: $($img.File) ($sizeMB MB)" -ForegroundColor Green
    }
    catch {
        Write-Host "    FAILED: Could not save $($img.Name). Is it pulled?" -ForegroundColor Red
        Write-Host "    Run: docker pull $($img.Name)" -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# Step 3: AI model (manual steps documented)
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "AI Model:" -ForegroundColor Yellow
Write-Host "  Docker Model Runner does not currently support 'docker model save'." -ForegroundColor Yellow
Write-Host "  For air-gap AI model deployment:" -ForegroundColor Yellow
Write-Host "    1. On an internet-connected machine, run: docker model pull ai/qwen3.5:35B-Q4_K_M" -ForegroundColor Gray
Write-Host "    2. Copy the model cache directory to the USB drive:" -ForegroundColor Gray
Write-Host "       Source: %USERPROFILE%\.docker\models\" -ForegroundColor Gray
Write-Host "       Dest:   $USBDir\models\" -ForegroundColor Gray
Write-Host "    3. On the target machine, copy models\ back to %USERPROFILE%\.docker\models\" -ForegroundColor Gray

$aiReadme = @"
# AI Model - Air-Gap Installation

Docker Model Runner does not currently support `docker model save`.

## Steps to transfer the AI model:

### On the internet-connected machine:
1. Pull the model: `docker model pull ai/qwen3.5:35B-Q4_K_M`
2. Copy the model cache: `%USERPROFILE%\.docker\models\`
3. Place it in this USB's `models\` directory

### On the target (air-gapped) machine:
1. Copy `models\` from USB to `%USERPROFILE%\.docker\models\`
2. Enable Docker Model Runner: `docker desktop enable model-runner --tcp 12434`
3. Verify: `docker model list`
"@

Set-Content -Path "$USBDir\AI-MODEL-README.txt" -Value $aiReadme

# ---------------------------------------------------------------------------
# Step 4: Copy installer files
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Copying installer files..." -ForegroundColor Yellow

# Copy scripts
$scriptFiles = @("install.ps1", "start.ps1", "stop.ps1", "status.ps1", "upgrade.ps1", "uninstall.ps1", "export-data.ps1")
foreach ($f in $scriptFiles) {
    $src = Join-Path "$scriptDir\scripts" $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination "$USBDir\scripts\$f" -Force
    }
}

# Copy config
$configFiles = @("docker-compose.yml", ".env.template", "Caddyfile")
foreach ($f in $configFiles) {
    $src = Join-Path "$scriptDir\config" $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination "$USBDir\config\$f" -Force
    }
}

# Copy license
$licenseSrc = Join-Path "$scriptDir\assets" "license.txt"
if (Test-Path $licenseSrc) {
    Copy-Item -Path $licenseSrc -Destination "$USBDir\LICENSE.txt" -Force
}

Write-Host "  Files copied - OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 5: Create air-gap install wrapper
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Creating air-gap install script..." -ForegroundColor Yellow

$airgapScript = @'
# =============================================================================
# Identity Radar - Air-Gap Installation Script
# Run this from the USB drive on the target machine
# =============================================================================

param(
    [string]$InstallDir = "C:\Program Files\IdentityRadar"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Identity Radar - Air-Gap Installer" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check Docker is available
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $dockerCmd) {
    Write-Host "ERROR: Docker Desktop is required but not installed." -ForegroundColor Red
    Write-Host "Install Docker Desktop first, then re-run this script." -ForegroundColor Red
    exit 1
}

# Load Docker images
Write-Host "Loading Docker images from USB..." -ForegroundColor Yellow

$imageFiles = Get-ChildItem -Path "$scriptDir\images" -Filter "*.tar" -ErrorAction SilentlyContinue
foreach ($imageFile in $imageFiles) {
    Write-Host "  Loading $($imageFile.Name)..." -ForegroundColor Gray
    & docker load -i $imageFile.FullName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Loaded - OK" -ForegroundColor Green
    }
    else {
        Write-Host "    FAILED to load $($imageFile.Name)" -ForegroundColor Red
    }
}

# Create install directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

# Copy config and scripts
Write-Host ""
Write-Host "Copying configuration files..." -ForegroundColor Yellow

if (Test-Path "$scriptDir\config") {
    Copy-Item -Path "$scriptDir\config" -Destination "$InstallDir\config" -Recurse -Force
}
if (Test-Path "$scriptDir\scripts") {
    Copy-Item -Path "$scriptDir\scripts" -Destination "$InstallDir\scripts" -Recurse -Force
}

# Run the main install script (skipping Docker install and model pull steps)
Write-Host ""
Write-Host "Running installation..." -ForegroundColor Yellow

$installScript = "$InstallDir\scripts\install.ps1"
if (Test-Path $installScript) {
    & powershell -ExecutionPolicy Bypass -File $installScript -InstallDir $InstallDir
}
else {
    Write-Host "ERROR: install.ps1 not found at $installScript" -ForegroundColor Red
    exit 1
}
'@

Set-Content -Path "$USBDir\airgap-install.ps1" -Value $airgapScript
Write-Host "  Air-gap install script created - OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 6: Calculate total size
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Calculating total USB package size..." -ForegroundColor Yellow

$totalSize = 0
Get-ChildItem -Path $USBDir -Recurse -File | ForEach-Object {
    $totalSize += $_.Length
}

$totalSizeGB = [math]::Round($totalSize / 1GB, 2)
$totalSizeMB = [math]::Round($totalSize / 1MB, 1)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Air-Gap USB Package Ready!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Location: $USBDir"

if ($totalSizeGB -ge 1) {
    Write-Host "  Total size: $totalSizeGB GB"
}
else {
    Write-Host "  Total size: $totalSizeMB MB"
}

Write-Host ""
Write-Host "  Copy the contents of $USBDir to a USB drive." -ForegroundColor Cyan
Write-Host "  On the target machine, run: .\airgap-install.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  NOTE: See AI-MODEL-README.txt for AI model transfer instructions." -ForegroundColor Yellow
Write-Host ""

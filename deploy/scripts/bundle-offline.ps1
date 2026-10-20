<#
.SYNOPSIS
Identity Radar — Offline Bundle Builder

.DESCRIPTION
Run this on a Windows machine WITH internet to create a complete offline package.
The output is a folder that can be copied to USB / transferred to an air-gapped machine.

.EXAMPLE
.\deploy\scripts\bundle-offline.ps1
.\deploy\scripts\bundle-offline.ps1 -Model "qwen2.5:7b"
#>

param (
    [string]$Model = "qwen2.5:1.5b"
)

$ErrorActionPreference = "Stop"

# Paths
$ScriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($ScriptDir)) { $ScriptDir = $PWD.Path }
$ProjectDir = (Get-Item $ScriptDir).Parent.FullName
$BundleDir = Join-Path $ProjectDir "identity-radar-offline"

# Helper functions for colored output
function Write-Info([string]$msg) { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Success([string]$msg) { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Fail([string]$msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗"
Write-Host "║  Identity Radar — Offline Bundle Builder     ║"
Write-Host "╚══════════════════════════════════════════════╝"
Write-Host ""

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) { Write-Fail "Docker is required." }
if (-not (Get-Command "ollama" -ErrorAction SilentlyContinue)) { Write-Fail "Ollama is required. Download from https://ollama.com/download" }

try {
    $null = docker info 2>&1
} catch {
    Write-Fail "Docker daemon is not running. Please start Docker Desktop."
}

# ---------------------------------------------------------------------------
# Step 1: Pull required Docker images
# ---------------------------------------------------------------------------
Write-Info "Step 1/5: Pulling Docker images..."
docker pull postgres:16-alpine | Out-Null
docker pull caddy:2-alpine | Out-Null
docker pull node:20-alpine | Out-Null
Write-Success "Docker images pulled"

# ---------------------------------------------------------------------------
# Step 2: Pull AI model via Ollama
# ---------------------------------------------------------------------------
Write-Info "Step 2/5: Pulling AI model: ${Model}..."
ollama pull $Model
Write-Success "Model ${Model} pulled"

# ---------------------------------------------------------------------------
# Step 3: Build the Identity Radar image
# ---------------------------------------------------------------------------
Write-Info "Step 3/5: Building Identity Radar Docker image..."
Set-Location $ProjectDir
docker build -f deploy/docker/Dockerfile -t identity-radar:latest . | Out-Null
Write-Success "Identity Radar image built"

# ---------------------------------------------------------------------------
# Step 4: Create the bundle directory
# ---------------------------------------------------------------------------
Write-Info "Step 4/5: Creating offline bundle..."
if (Test-Path $BundleDir) { Remove-Item -Recurse -Force $BundleDir }
$null = New-Item -ItemType Directory -Path "$BundleDir/images" -Force
$null = New-Item -ItemType Directory -Path "$BundleDir/model" -Force
$null = New-Item -ItemType Directory -Path "$BundleDir/scripts" -Force
$null = New-Item -ItemType Directory -Path "$BundleDir/config" -Force

# Save Docker images as tarballs (Skipping gzip for native Windows compatibility)
Write-Info "  Saving identity-radar image (this might take a minute)..."
docker save -o "$BundleDir/images/identity-radar.tar" identity-radar:latest

Write-Info "  Saving postgres image..."
docker save -o "$BundleDir/images/postgres-16-alpine.tar" postgres:16-alpine

Write-Info "  Saving caddy image..."
docker save -o "$BundleDir/images/caddy-2-alpine.tar" caddy:2-alpine

# Copy Ollama model files
Write-Info "  Copying AI model files..."
$OllamaModelsDir = Join-Path $env:USERPROFILE ".ollama\models"
if (Test-Path $OllamaModelsDir) {
    Copy-Item -Path "$OllamaModelsDir" -Destination "$BundleDir\model\ollama-models" -Recurse -Force
    Write-Success "Model files copied"
} else {
    Write-Host "  Warning: Could not find Ollama models directory at $OllamaModelsDir. You'll need to copy manually." -ForegroundColor Yellow
}

# Copy config files
Copy-Item -Path "$ProjectDir/docker/docker-compose.prod.yml" -Destination "$BundleDir/config/" -Force
Copy-Item -Path "$ProjectDir/docker/Caddyfile" -Destination "$BundleDir/config/" -Force
Copy-Item -Path "$ProjectDir/.env.example" -Destination "$BundleDir/config/" -Force

# Copy deployment scripts (Will copy .sh or .ps1 files if they exist)
if (Test-Path "$ProjectDir/scripts/backup.*") { Copy-Item "$ProjectDir/scripts/backup.*" "$BundleDir/scripts/" -Force }
if (Test-Path "$ProjectDir/scripts/restore.*") { Copy-Item "$ProjectDir/scripts/restore.*" "$BundleDir/scripts/" -Force }

# ---------------------------------------------------------------------------
# Step 5: Create the offline install script (install.ps1)
# ---------------------------------------------------------------------------
$InstallScriptContent = @'
<#
.SYNOPSIS
Identity Radar — Offline Installer (Windows)
Run this on the TARGET machine (no internet required)
#>
param (
    [string]$Domain = "localhost"
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot

function Write-Info([string]$msg) { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Success([string]$msg) { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Fail([string]$msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗"
Write-Host "║  Identity Radar — Offline Installation       ║"
Write-Host "╚══════════════════════════════════════════════╝"
Write-Host ""
Write-Info "Domain: $Domain"
Write-Host ""

# Check Docker
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) { Write-Fail "Docker is required. Install Docker Desktop first." }
try { $null = docker info 2>&1 } catch { Write-Fail "Docker daemon is not running." }

# Step 1: Load Docker images
Write-Info "Step 1/6: Loading Docker images..."
Get-ChildItem -Path "$ScriptDir\images\*.tar" | ForEach-Object {
    Write-Info "  Loading $($_.Name)..."
    docker load -i $_.FullName | Out-Null
}
Write-Success "All images loaded"

# Step 2: Install Ollama (if not installed)
Write-Info "Step 2/6: Checking Ollama..."
if (-not (Get-Command "ollama" -ErrorAction SilentlyContinue)) {
    Write-Info "  Ollama not found. Please install Ollama first:"
    Write-Host "  Download from https://ollama.com/download"
    Write-Host "  After installing, re-run this script."
    exit 1
}
Write-Success "Ollama is installed"

# Step 3: Copy AI model
Write-Info "Step 3/6: Installing AI model..."
$SourceModels = "$ScriptDir\model\ollama-models"
if (Test-Path $SourceModels) {
    $OllamaTarget = Join-Path $env:USERPROFILE ".ollama\models"
    if (-not (Test-Path $OllamaTarget)) { New-Item -ItemType Directory -Path $OllamaTarget -Force | Out-Null }
    Copy-Item -Path "$SourceModels\*" -Destination $OllamaTarget -Recurse -Force
    Write-Success "AI model installed"
} else {
    Write-Host "  Warning: No model files found in bundle. You'll need to pull manually." -ForegroundColor Yellow
}

# Step 4: Create install directory
$InstallDir = "C:\identity-radar"
Write-Info "Step 4/6: Setting up $InstallDir..."
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
Copy-Item -Path "$ScriptDir\config\docker-compose.prod.yml" -Destination $InstallDir -Force
Copy-Item -Path "$ScriptDir\config\Caddyfile" -Destination $InstallDir -Force
if (Test-Path "$ScriptDir\scripts\*") { Copy-Item -Path "$ScriptDir\scripts\*" -Destination $InstallDir -Recurse -Force }

# Step 5: Generate config
Write-Info "Step 5/6: Generating configuration..."
$NextAuthSecret = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray() + [Guid]::NewGuid().ToByteArray())
$PostgresPassword = [Guid]::NewGuid().ToString('N')

if ($Domain -eq "localhost") { $AppUrl = "http://localhost" } else { $AppUrl = "https://$Domain" }

$EnvContent = @"
# Identity Radar — Production Environment (Offline)
POSTGRES_DB=identity_radar
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$PostgresPassword
DATABASE_URL=postgresql://postgres:$PostgresPassword@db:5432/identity_radar
NEXTAUTH_SECRET=$NextAuthSecret
NEXTAUTH_URL=$AppUrl
AUTH_TRUST_HOST=true
NEXT_PUBLIC_APP_URL=$AppUrl
NODE_ENV=production
DOMAIN=$Domain
AI_PROVIDER=ollama
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:1.5b
"@

Set-Content -Path "$InstallDir\.env.production" -Value $EnvContent
Write-Success "Configuration generated"

# Step 6: Start services
Write-Info "Step 6/6: Starting Identity Radar..."

# Start Ollama (Windows handles this as a background app natively when installed, but we ensure it's up)
Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 3

Set-Location $InstallDir
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# Wait for health
Write-Info "Waiting for services to start..."
$MaxWait = 120
$Elapsed = 0
$IsUp = $false

while ($Elapsed -lt $MaxWait) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) { $IsUp = $true; break }
    } catch {
        # Suppress errors while waiting
    }
    Start-Sleep -Seconds 3
    $Elapsed += 3
}

if (-not $IsUp) {
    Write-Host "`n  App is taking longer than expected." -ForegroundColor Yellow
    Write-Host "  Check logs: docker compose --env-file .env.production -f docker-compose.prod.yml logs app" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║       Identity Radar is running!             ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Info "URL:              $AppUrl"
Write-Info "Default login:    admin@acmefs.sa / admin123"
Write-Info "AI Model:         qwen2.5:1.5b (running locally)"
Write-Host ""
Write-Info "Management Commands (Run in $InstallDir):"
Write-Host "  Status:   docker compose --env-file .env.production -f docker-compose.prod.yml ps"
Write-Host "  Stop:     docker compose --env-file .env.production -f docker-compose.prod.yml down"
Write-Host "  Logs:     docker compose --env-file .env.production -f docker-compose.prod.yml logs -f"
Write-Host ""
'@

Set-Content -Path "$BundleDir/install.ps1" -Value $InstallScriptContent

# ---------------------------------------------------------------------------
# Step 6: Create README
# ---------------------------------------------------------------------------
$ReadmeContent = @'
================================================================================
  Identity Radar — Offline Installation Package (Windows)
================================================================================

CONTENTS:
  images/             Docker images (Identity Radar, PostgreSQL, Caddy)
  model/              AI model files (Ollama)
  config/             Configuration templates
  scripts/            Management scripts
  install.ps1         Installation script

PREREQUISITES:
  - Windows 10/11 or Windows Server (with WSL2 enabled if required by Docker)
  - Docker Desktop installed and running
  - Ollama installed (https://ollama.com)
  - 8 GB RAM minimum (16 GB recommended)
  - 10 GB free disk space

INSTALLATION:
  1. Copy this entire folder to the target machine.
  2. Open PowerShell as Administrator in this folder.
  3. Run the installer:

     .\install.ps1

     Or with a custom domain:

     .\install.ps1 -Domain "identityradar.company.com"

  4. Open http://localhost:3000 in your browser
  5. Login: admin@acmefs.sa / admin123
  6. Go to "Import Data" to upload your AD data

NO INTERNET REQUIRED:
  Everything runs locally. No data leaves the machine.
  The AI model runs on CPU/GPU depending on your Ollama setup.

IMPORTING YOUR DATA:
  On your Domain Controller, run these PowerShell commands:

  Command 1 (Users):
    Get-ADUser -Filter * -Properties * | Export-Csv ir-users.csv -NoTypeInformation

  Command 2 (Groups):
    Get-ADGroup -Filter * -Properties Members | Export-Csv ir-groups.csv -NoTypeInformation

  Then upload both files in Identity Radar → Import Data

MANAGEMENT:
  (Run these from C:\identity-radar)
  Start:    docker compose --env-file .env.production -f docker-compose.prod.yml up -d
  Stop:     docker compose --env-file .env.production -f docker-compose.prod.yml down

SUPPORT:
  https://github.com/ASHS21/IDR-C/issues
================================================================================
'@

Set-Content -Path "$BundleDir/README.txt" -Value $ReadmeContent

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
# Calculate folder size
$SizeCalc = Get-ChildItem -Path $BundleDir -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
$BundleSize = "{0:N2} MB" -f ($SizeCalc.Sum / 1MB)

Write-Host ""
Write-Success "Offline bundle created!"
Write-Host ""
Write-Info "Location:  $BundleDir"
Write-Info "Size:      $BundleSize"
Write-Info "AI Model:  $Model"
Write-Host ""
Write-Info "Contents of images directory:"
Get-ChildItem "$BundleDir/images/" | Select-Object Name, @{Name="Size(MB)";Expression={"{0:N2}" -f ($_.Length / 1MB)}} | Format-Table -AutoSize
Write-Host ""
Write-Info "Next steps:"
Write-Host "  1. Copy the 'identity-radar-offline' folder to a USB drive or transfer to the target machine."
Write-Host "  2. On the target machine, open PowerShell and run: .\install.ps1"
Write-Host "  3. Open http://localhost:3000"
Write-Host ""

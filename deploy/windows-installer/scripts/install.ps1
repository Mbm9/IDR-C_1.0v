# WARNING: This script uses -ExecutionPolicy Bypass and downloads executables.
# Corporate EDR solutions (CrowdStrike, SentinelOne, Defender for Endpoint)
# WILL flag this behavior. For customer demos, use Docker Compose directly
# instead of this installer. See docs/getting-started/customer-demo-setup.md
# =============================================================================
# Identity Radar - Windows Installation Script
# PowerShell 5.1 compatible (Windows 10 built-in)
# =============================================================================

[CmdletBinding()]
param(
    [string]$InstallDir = "C:\Program Files\IdentityRadar",
    [int]$Port = 3000,
    [string]$OrgName = "My Organization",
    [string]$AdminEmail = "admin@example.com"
)

$ErrorActionPreference = "Stop"

# =============================================================================
# Helpers
# =============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Host $logLine
    if (Test-Path $InstallDir) {
        Add-Content -Path "$InstallDir\install.log" -Value $logLine
    }
}

function Write-Step {
    param([int]$StepNum, [string]$Description)
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Step $StepNum of 13: $Description" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Log "Step $StepNum: $Description"
}

function Save-Progress {
    param([int]$Step)
    Set-Content -Path "$InstallDir\.install-progress" -Value $Step
}

function Get-SavedProgress {
    $progressFile = "$InstallDir\.install-progress"
    if (Test-Path $progressFile) {
        $content = Get-Content -Path $progressFile -ErrorAction SilentlyContinue
        if ($content) {
            $parsed = 0
            if ([int]::TryParse($content.Trim(), [ref]$parsed)) {
                return $parsed
            }
        }
    }
    return 0
}

function Get-RandomPassword {
    param([int]$Length = 20)
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#%^&*"
    $password = ""
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] 1
    for ($i = 0; $i -lt $Length; $i++) {
        $rng.GetBytes($bytes)
        $index = [int]($bytes[0]) % $chars.Length
        $password += $chars[$index]
    }
    $rng.Dispose()
    return $password
}

function Get-RandomSecret {
    param([int]$Length = 32)
    $bytes = New-Object byte[] $Length
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return [Convert]::ToBase64String($bytes)
}

# =============================================================================
# Banner
# =============================================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Identity Radar - Windows Installer" -ForegroundColor Green
Write-Host "  Version 1.0.0" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Install Directory: $InstallDir"
Write-Host "  Port:              $Port"
Write-Host "  Organization:      $OrgName"
Write-Host "  Admin Email:       $AdminEmail"
Write-Host ""

# Create install directory if it does not exist
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Write-Log "Created install directory: $InstallDir"
}

# Check for restart recovery
$resumeStep = Get-SavedProgress
if ($resumeStep -gt 0) {
    Write-Log "Resuming from step $($resumeStep + 1) (previous run completed step $resumeStep)" "WARN"
    Write-Host "  Resuming from step $($resumeStep + 1)..." -ForegroundColor Yellow
}

# =============================================================================
# Step 1: Validate Windows version
# =============================================================================

if ($resumeStep -lt 1) {
    Write-Step 1 "Validating Windows version"

    $osVersion = [Environment]::OSVersion.Version
    $buildNumber = $osVersion.Build
    Write-Log "Windows build number: $buildNumber"

    if ($buildNumber -lt 19041) {
        Write-Log "Windows build $buildNumber is below minimum 19041" "ERROR"
        Write-Host "  FAILED: Windows 10 version 2004 (build 19041) or later is required." -ForegroundColor Red
        Write-Host "  Current build: $buildNumber" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Windows build $buildNumber - OK" -ForegroundColor Green
    Save-Progress 1
}

# =============================================================================
# Step 2: Validate RAM
# =============================================================================

if ($resumeStep -lt 2) {
    Write-Step 2 "Validating system memory"

    $computerInfo = Get-CimInstance Win32_ComputerSystem
    $totalRAMGB = [math]::Round($computerInfo.TotalPhysicalMemory / 1GB, 1)
    Write-Log "Total RAM: $totalRAMGB GB"

    if ($totalRAMGB -lt 14) {
        Write-Log "Insufficient RAM: $totalRAMGB GB (minimum 14 GB)" "ERROR"
        Write-Host "  FAILED: Minimum 14 GB RAM required." -ForegroundColor Red
        Write-Host "  Current RAM: $totalRAMGB GB" -ForegroundColor Red
        exit 1
    }

    Write-Host "  RAM: $totalRAMGB GB - OK" -ForegroundColor Green
    Save-Progress 2
}

# =============================================================================
# Step 3: Validate disk space
# =============================================================================

if ($resumeStep -lt 3) {
    Write-Step 3 "Validating disk space"

    $driveLetter = (Split-Path -Qualifier $InstallDir).TrimEnd(":")
    if (-not $driveLetter) {
        $driveLetter = "C"
    }
    $drive = Get-PSDrive -Name $driveLetter -ErrorAction SilentlyContinue
    if ($null -eq $drive) {
        Write-Log "Could not find drive $driveLetter" "ERROR"
        Write-Host "  FAILED: Could not find drive $driveLetter" -ForegroundColor Red
        exit 1
    }

    $freeGB = [math]::Round($drive.Free / 1GB, 1)
    Write-Log "Free disk space on ${driveLetter}: $freeGB GB"

    if ($freeGB -lt 50) {
        Write-Log "Insufficient disk space: $freeGB GB (minimum 50 GB)" "ERROR"
        Write-Host "  FAILED: Minimum 50 GB free disk space required on drive ${driveLetter}:." -ForegroundColor Red
        Write-Host "  Available: $freeGB GB" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Disk space: $freeGB GB free on ${driveLetter}: - OK" -ForegroundColor Green
    Save-Progress 3
}

# =============================================================================
# Step 4: Check / Install Docker Desktop
# =============================================================================

if ($resumeStep -lt 4) {
    Write-Step 4 "Checking Docker Desktop"

    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $dockerCmd) {
        Write-Log "Docker not found. Downloading Docker Desktop installer..." "WARN"
        Write-Host "  Docker Desktop not found. Downloading..." -ForegroundColor Yellow

        $dockerInstallerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
        $dockerInstallerPath = "$env:TEMP\DockerDesktopInstaller.exe"

        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $dockerInstallerUrl -OutFile $dockerInstallerPath -UseBasicParsing
            Write-Log "Docker Desktop installer downloaded to $dockerInstallerPath"
        }
        catch {
            Write-Log "Failed to download Docker Desktop: $_" "ERROR"
            Write-Host "  FAILED: Could not download Docker Desktop." -ForegroundColor Red
            Write-Host "  Please download manually from https://docker.com/products/docker-desktop" -ForegroundColor Red
            exit 1
        }

        Write-Host "  Installing Docker Desktop (this may take several minutes)..." -ForegroundColor Yellow
        Write-Log "Running Docker Desktop silent install"
        $installProcess = Start-Process -FilePath $dockerInstallerPath -ArgumentList "install", "--quiet", "--accept-license" -Wait -PassThru
        if ($installProcess.ExitCode -ne 0) {
            Write-Log "Docker Desktop installation failed with exit code $($installProcess.ExitCode)" "ERROR"
            Write-Host "  FAILED: Docker Desktop installation failed." -ForegroundColor Red
            exit 1
        }

        Remove-Item $dockerInstallerPath -ErrorAction SilentlyContinue
        Write-Log "Docker Desktop installed successfully"
        Write-Host "  Docker Desktop installed. A restart may be required." -ForegroundColor Green
    }
    else {
        $dockerVersion = & docker --version 2>$null
        Write-Log "Docker found: $dockerVersion"
        Write-Host "  $dockerVersion - OK" -ForegroundColor Green
    }

    Save-Progress 4
}

# =============================================================================
# Step 5: Check WSL2
# =============================================================================

if ($resumeStep -lt 5) {
    Write-Step 5 "Checking WSL2"

    $wslStatus = $null
    try {
        $wslStatus = & wsl --status 2>&1
    }
    catch {
        $wslStatus = $null
    }

    $wslAvailable = $false
    if ($null -ne $wslStatus) {
        $wslString = $wslStatus | Out-String
        if ($wslString -match "Default Version:\s*2" -or $wslString -match "WSL version" -or $wslString -match "Default Distribution") {
            $wslAvailable = $true
        }
    }

    if (-not $wslAvailable) {
        Write-Log "WSL2 not available. Installing..." "WARN"
        Write-Host "  WSL2 not available. Installing WSL..." -ForegroundColor Yellow

        try {
            & wsl --install --no-distribution
            Write-Log "WSL install command executed. Restart required."
            Write-Host "  WSL2 installation initiated. A system restart is required." -ForegroundColor Yellow
            Write-Host "  After restarting, run this installer again to continue." -ForegroundColor Yellow
            Save-Progress 5
            exit 3010
        }
        catch {
            Write-Log "Failed to install WSL2: $_" "ERROR"
            Write-Host "  FAILED: Could not install WSL2. Please install manually." -ForegroundColor Red
            exit 1
        }
    }
    else {
        Write-Host "  WSL2 - OK" -ForegroundColor Green
        Write-Log "WSL2 is available"
    }

    Save-Progress 5
}

# =============================================================================
# Step 6: Start Docker Desktop
# =============================================================================

if ($resumeStep -lt 6) {
    Write-Step 6 "Starting Docker Desktop"

    $dockerRunning = $false
    try {
        $dockerInfo = & docker info 2>&1
        $infoString = $dockerInfo | Out-String
        if ($infoString -notmatch "error") {
            $dockerRunning = $true
        }
    }
    catch {
        $dockerRunning = $false
    }

    if (-not $dockerRunning) {
        Write-Log "Docker daemon not running. Starting Docker Desktop..."
        Write-Host "  Starting Docker Desktop..." -ForegroundColor Yellow

        $dockerDesktopPath = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
        if (-not (Test-Path $dockerDesktopPath)) {
            $dockerDesktopPath = "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
        }
        if (-not (Test-Path $dockerDesktopPath)) {
            # Try common AppData location
            $dockerDesktopPath = "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
        }

        if (Test-Path $dockerDesktopPath) {
            Start-Process $dockerDesktopPath
        }
        else {
            Write-Log "Could not find Docker Desktop executable" "WARN"
            Write-Host "  Could not find Docker Desktop. Please start it manually." -ForegroundColor Yellow
        }

        # Poll for Docker to be ready
        $maxRetries = 30
        $retryCount = 0
        $ready = $false

        Write-Host "  Waiting for Docker daemon to start (up to 5 minutes)..." -ForegroundColor Yellow
        while ($retryCount -lt $maxRetries) {
            Start-Sleep -Seconds 10
            $retryCount++
            try {
                $testInfo = & docker info 2>&1
                $testString = $testInfo | Out-String
                if ($testString -notmatch "error") {
                    $ready = $true
                    break
                }
            }
            catch {
                # Still waiting
            }
            Write-Host "    Attempt $retryCount of $maxRetries..." -ForegroundColor Gray
        }

        if (-not $ready) {
            Write-Log "Docker daemon did not start within timeout" "ERROR"
            Write-Host "  FAILED: Docker daemon did not start. Please start Docker Desktop and re-run." -ForegroundColor Red
            exit 1
        }
    }

    Write-Host "  Docker daemon is running - OK" -ForegroundColor Green
    Write-Log "Docker daemon is running"
    Save-Progress 6
}

# =============================================================================
# Step 7: Enable Docker Model Runner
# =============================================================================

if ($resumeStep -lt 7) {
    Write-Step 7 "Enabling Docker Model Runner"

    try {
        $modelRunnerOutput = & docker desktop enable model-runner --tcp 12434 2>&1
        $outputString = $modelRunnerOutput | Out-String
        Write-Log "Docker Model Runner output: $outputString"
        Write-Host "  Docker Model Runner enabled (TCP port 12434) - OK" -ForegroundColor Green
    }
    catch {
        Write-Log "Failed to enable Docker Model Runner: $_" "WARN"
        Write-Host "  WARNING: Could not enable Docker Model Runner." -ForegroundColor Yellow
        Write-Host "  You may need to enable it manually in Docker Desktop settings." -ForegroundColor Yellow
    }

    Save-Progress 7
}

# =============================================================================
# Step 8: Pull AI model
# =============================================================================

if ($resumeStep -lt 8) {
    Write-Step 8 "Pulling AI model (this may take a while)"

    Write-Host "  Downloading ai/qwen3.5:35B-Q4_K_M..." -ForegroundColor Yellow
    Write-Log "Pulling AI model: ai/qwen3.5:35B-Q4_K_M"

    try {
        & docker model pull ai/qwen3.5:35B-Q4_K_M 2>&1 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
        Write-Log "AI model pulled successfully"
        Write-Host "  AI model downloaded - OK" -ForegroundColor Green
    }
    catch {
        Write-Log "Failed to pull AI model: $_" "WARN"
        Write-Host "  WARNING: Could not pull AI model. AI features may not work." -ForegroundColor Yellow
        Write-Host "  You can retry later with: docker model pull ai/qwen3.5:35B-Q4_K_M" -ForegroundColor Yellow
    }

    Save-Progress 8
}

# =============================================================================
# Step 9: Generate .env
# =============================================================================

if ($resumeStep -lt 9) {
    Write-Step 9 "Generating environment configuration"

    $envFile = "$InstallDir\.env"
    $templateFile = "$InstallDir\config\.env.template"

    if (-not (Test-Path $templateFile)) {
        # Try relative to script location
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $templateFile = Join-Path (Split-Path -Parent $scriptDir) "config\.env.template"
    }

    if (-not (Test-Path $templateFile)) {
        Write-Log "Could not find .env.template" "ERROR"
        Write-Host "  FAILED: Could not find .env.template" -ForegroundColor Red
        exit 1
    }

    $dbPassword = Get-RandomPassword -Length 20
    $nextAuthSecret = Get-RandomSecret -Length 32

    $envContent = Get-Content -Path $templateFile -Raw
    $envContent = $envContent.Replace("__DB_PASSWORD__", $dbPassword)
    $envContent = $envContent.Replace("__NEXTAUTH_SECRET__", $nextAuthSecret)
    $envContent = $envContent.Replace("__PORT__", $Port.ToString())

    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
    Write-Log "Generated .env with random secrets"
    Write-Host "  Environment configuration generated - OK" -ForegroundColor Green

    Save-Progress 9
}

# =============================================================================
# Step 10: Copy docker-compose.yml
# =============================================================================

if ($resumeStep -lt 10) {
    Write-Step 10 "Setting up Docker Compose configuration"

    $composeSource = "$InstallDir\config\docker-compose.yml"
    $composeDest = "$InstallDir\docker-compose.yml"

    if (-not (Test-Path $composeSource)) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $composeSource = Join-Path (Split-Path -Parent $scriptDir) "config\docker-compose.yml"
    }

    if (Test-Path $composeSource) {
        Copy-Item -Path $composeSource -Destination $composeDest -Force
        Write-Log "Copied docker-compose.yml to $composeDest"
    }
    else {
        Write-Log "docker-compose.yml not found at $composeSource" "ERROR"
        Write-Host "  FAILED: docker-compose.yml not found" -ForegroundColor Red
        exit 1
    }

    # Also copy Caddyfile
    $caddySource = "$InstallDir\config\Caddyfile"
    $caddyDest = "$InstallDir\Caddyfile"
    if (-not (Test-Path $caddySource)) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $caddySource = Join-Path (Split-Path -Parent $scriptDir) "config\Caddyfile"
    }
    if (Test-Path $caddySource) {
        Copy-Item -Path $caddySource -Destination $caddyDest -Force
        Write-Log "Copied Caddyfile to $caddyDest"
    }

    Write-Host "  Docker Compose configuration ready - OK" -ForegroundColor Green
    Save-Progress 10
}

# =============================================================================
# Step 11: Docker Compose up
# =============================================================================

if ($resumeStep -lt 11) {
    Write-Step 11 "Starting Identity Radar services"

    Set-Location $InstallDir
    Write-Log "Running docker compose up -d in $InstallDir"

    try {
        & docker compose up -d 2>&1 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
        Write-Log "Docker compose up completed"
        Write-Host "  Services started - OK" -ForegroundColor Green
    }
    catch {
        Write-Log "docker compose up failed: $_" "ERROR"
        Write-Host "  FAILED: Could not start services." -ForegroundColor Red
        exit 1
    }

    Save-Progress 11
}

# =============================================================================
# Step 12: Wait for health check
# =============================================================================

if ($resumeStep -lt 12) {
    Write-Step 12 "Waiting for Identity Radar to be ready"

    $healthUrl = "http://localhost:$Port/api/health"
    $maxWaitSeconds = 300
    $elapsedSeconds = 0
    $healthy = $false

    Write-Host "  Checking $healthUrl (timeout: 5 minutes)..." -ForegroundColor Yellow

    while ($elapsedSeconds -lt $maxWaitSeconds) {
        Start-Sleep -Seconds 5
        $elapsedSeconds += 5

        try {
            $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                $healthy = $true
                break
            }
        }
        catch {
            # Still waiting
        }

        if (($elapsedSeconds % 30) -eq 0) {
            Write-Host "    Waiting... ($elapsedSeconds seconds elapsed)" -ForegroundColor Gray
        }
    }

    if (-not $healthy) {
        Write-Log "Health check did not pass within $maxWaitSeconds seconds" "ERROR"
        Write-Host "  WARNING: Health check did not pass within timeout." -ForegroundColor Yellow
        Write-Host "  Services may still be starting. Check: docker compose logs" -ForegroundColor Yellow
    }
    else {
        Write-Log "Health check passed"
        Write-Host "  Identity Radar is healthy - OK" -ForegroundColor Green
    }

    Save-Progress 12
}

# =============================================================================
# Step 13: Complete
# =============================================================================

Write-Step 13 "Completing installation"

# Write completion marker
Set-Content -Path "$InstallDir\.install-complete" -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Remove progress file
if (Test-Path "$InstallDir\.install-progress") {
    Remove-Item "$InstallDir\.install-progress" -Force
}

Write-Log "Installation completed successfully"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Identity Radar is running at:" -ForegroundColor Cyan
Write-Host "  http://localhost:$Port" -ForegroundColor White
Write-Host ""
Write-Host "  Organization: $OrgName" -ForegroundColor Cyan
Write-Host "  Admin Email:  $AdminEmail" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Management scripts:" -ForegroundColor Cyan
Write-Host "    Start:   $InstallDir\scripts\start.ps1" -ForegroundColor White
Write-Host "    Stop:    $InstallDir\scripts\stop.ps1" -ForegroundColor White
Write-Host "    Status:  $InstallDir\scripts\status.ps1" -ForegroundColor White
Write-Host "    Backup:  $InstallDir\scripts\export-data.ps1" -ForegroundColor White
Write-Host "    Upgrade: $InstallDir\scripts\upgrade.ps1" -ForegroundColor White
Write-Host ""
Write-Host "  Logs: $InstallDir\install.log" -ForegroundColor Gray
Write-Host ""

# Open browser
Start-Process "http://localhost:$Port"

Save-Progress 13
exit 0

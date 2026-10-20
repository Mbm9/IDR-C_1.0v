# =============================================================================
# Identity Radar - Build Installer
# Requires Inno Setup 6 (https://jrsoftware.org/isinfo.php)
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Identity Radar - Build Installer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Find Inno Setup compiler
$iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
    $iscc = "C:\Program Files\Inno Setup 6\ISCC.exe"
}

if (-not (Test-Path $iscc)) {
    Write-Host "ERROR: Inno Setup 6 not found." -ForegroundColor Red
    Write-Host "Install from: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    exit 1
}

Write-Host "Using Inno Setup: $iscc" -ForegroundColor Gray

# Ensure Output directory exists
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $scriptDir "Output"
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

# Build
Write-Host "Compiling installer..." -ForegroundColor Yellow
$issFile = Join-Path $scriptDir "identity-radar.iss"

& $iscc $issFile

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

# Report
$exe = Join-Path $outputDir "IdentityRadar-Setup-1.0.0.exe"
if (Test-Path $exe) {
    $hash = (Get-FileHash $exe -Algorithm SHA256).Hash
    $size = (Get-Item $exe).Length
    $sizeMB = [math]::Round($size / 1MB, 2)

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  Build Successful!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  File:   $exe"
    Write-Host "  Size:   $sizeMB MB"
    Write-Host "  SHA256: $hash"
    Write-Host ""
}
else {
    Write-Host "WARNING: Expected output file not found at $exe" -ForegroundColor Yellow
}

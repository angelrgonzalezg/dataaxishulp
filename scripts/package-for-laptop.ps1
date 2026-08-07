# Creates a laptop install ZIP (no git push, no secrets, no node_modules).
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\package-for-laptop.ps1

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$outDir = Join-Path $root 'dist-packages'
$stageName = "Dataaxishulp-laptop-$stamp"
$stage = Join-Path $outDir $stageName
$zipPath = Join-Path $outDir "$stageName.zip"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Write-Host "Staging from $root ..."
Write-Host "Target: $stage"

$excludeDirNames = @(
  '.git',
  'node_modules',
  'dist',
  'build',
  'dist-packages',
  '.cursor',
  '.vscode',
  '.idea',
  'coverage',
  'generated'
)

function ShouldSkipDir([string]$fullPath) {
  $name = Split-Path $fullPath -Leaf
  return $excludeDirNames -contains $name
}

function Copy-TreeFiltered([string]$source, [string]$destination) {
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
    if ($_.PSIsContainer) {
      if (ShouldSkipDir $_.FullName) { return }
      Copy-TreeFiltered $_.FullName (Join-Path $destination $_.Name)
      return
    }

    $name = $_.Name
    if ($name -eq '.env') { return }
    if ($name -like '*.log') { return }
    if ($name -eq 'tsconfig.tsbuildinfo') { return }
    if ($name -like '*.zip') { return }

    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destination $name) -Force
  }
}

Copy-TreeFiltered $root $stage

# Ensure install guide is present at package root
$guideSrc = Join-Path $root 'INSTALL-LAPTOP.md'
if (Test-Path $guideSrc) {
  Copy-Item -LiteralPath $guideSrc -Destination (Join-Path $stage 'INSTALL-LAPTOP.md') -Force
}

if (-not (Test-Path (Join-Path $stage 'backend\.env.example'))) {
  throw 'backend/.env.example missing from staged package'
}

if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

Write-Host "Compressing $zipPath ..."
Compress-Archive -Path $stage -DestinationPath $zipPath -CompressionLevel Optimal

$zip = Get-Item $zipPath
Write-Host ""
Write-Host "OK"
Write-Host "ZIP: $($zip.FullName)"
Write-Host ("Size: {0:N1} MB" -f ($zip.Length / 1MB))
Write-Host "Staged folder kept at: $stage"
Write-Host ""
Write-Host "On the laptop: unzip, follow INSTALL-LAPTOP.md"
Write-Host "Tip: copy your working backend/.env separately (not included in the ZIP)."

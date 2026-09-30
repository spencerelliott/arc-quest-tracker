<#
.SYNOPSIS
  Windows version of build-config.sh: writes config.js from ARC_APP_KEY and can package a
  drag-and-drop deploy for Netlify.

.DESCRIPTION
  Reads ARC_APP_KEY from the environment, or from a .env file next to this script.
  With -Package, also copies the site files to dist\site (drag this folder to Netlify)
  and zips them to dist\arc-quests.zip.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\build-config.ps1 -Package
#>
[CmdletBinding()]
param(
  [switch]$Package
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$key = $env:ARC_APP_KEY
if (-not $key -and (Test-Path -LiteralPath '.env')) {
  $line = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^\s*ARC_APP_KEY\s*=' } | Select-Object -Last 1
  if ($line) {
    $key = ($line -replace '^\s*ARC_APP_KEY\s*=\s*', '').Trim().Trim('"', "'")
  }
}
if (-not $key) { $key = '' }

if ($key -notmatch '^[A-Za-z0-9_-]*$') {
  Write-Error 'build-config: ARC_APP_KEY contains unexpected characters'
}

if (-not $key) {
  if ($Package) {
    Write-Error 'build-config: ARC_APP_KEY is not set (set it in the environment or .env)'
  }
  Write-Warning "build-config: ARC_APP_KEY is not set; the app won't be able to load user data"
}

# UTF-8 without a BOM and with LF, to match the shell script's output.
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'config.js'), "window.ARC_CONFIG = { appKey: `"$key`" };`n", $utf8)
Write-Host 'build-config: wrote config.js'

if (-not $Package) { return }

# Files the deployed site needs. Keep in sync with build-config.sh. netlify.toml is left
# out on purpose: with it, a signed-in drag-and-drop deploy runs the build again on
# Netlify and overwrites config.js with an empty key.
$files = @(
  'index.html', 'styles.css', 'app.js', 'config.js', 'sw.js', 'manifest.webmanifest',
  '_redirects', '_headers',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png'
)

$dist = Join-Path $PSScriptRoot 'dist'
$site = Join-Path $dist 'site'
if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $site 'icons') -Force | Out-Null

foreach ($f in $files) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $f) -Destination (Join-Path $site $f)
}

# Build the zip by hand: Compress-Archive in Windows PowerShell 5.1 writes backslashes
# into entry names, which other platforms don't treat as folders.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $dist 'arc-quests.zip'
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in $files) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, (Join-Path $site $f), $f, [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
}
finally {
  $zip.Dispose()
}

Write-Host 'build-config: wrote dist\site\ (drag this folder to Netlify) and dist\arc-quests.zip'

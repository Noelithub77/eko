$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$env:CARGO_TARGET_DIR = Join-Path $projectRoot "rust\target\desktop-dev"

Set-Location -LiteralPath $projectRoot
Write-Host "Starting Tauri desktop dev with Cargo target: $env:CARGO_TARGET_DIR"
& npm.cmd run tauri -- dev

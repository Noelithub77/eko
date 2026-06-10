$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$env:CARGO_TARGET_DIR = Join-Path $projectRoot "rust\target\android-dev"
$hostAddress = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -match "^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)" -and
    $_.IPAddress -notmatch "^169\.254\." -and
    $_.InterfaceAlias -notmatch "VMware|Virtual|WSL|Docker|Loopback|Bluetooth"
  } |
  Sort-Object @{
    Expression = {
      if ($_.InterfaceAlias -match "Wi-Fi|Wifi|WLAN") { 0 }
      elseif ($_.InterfaceAlias -match "Ethernet") { 1 }
      else { 2 }
    }
  } |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $hostAddress) {
  throw "No LAN IPv4 address found for Tauri Android dev. Connect this PC to Wi-Fi or Ethernet."
}

Write-Host "Stopping stale Android dev processes."
& (Join-Path $PSScriptRoot "stop-android-dev.ps1")

Set-Location -LiteralPath $projectRoot
Write-Host "Starting Tauri Android dev on host $hostAddress."
Write-Host "Using Android Cargo target: $env:CARGO_TARGET_DIR"
Write-Host "Android Studio should open. Keep this terminal running, then press Run in Android Studio."
& npm.cmd run tauri -- android dev --open --host $hostAddress

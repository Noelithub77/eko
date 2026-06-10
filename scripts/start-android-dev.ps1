$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$env:CARGO_TARGET_DIR = Join-Path $projectRoot "rust\target\android-dev"
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
  throw "npm.cmd was not found on PATH. Install Node.js or add npm to PATH before starting Android dev."
}
$env:EKO_NPM_PATH = $npmCommand.Source
$lanHostAddress = Get-NetIPAddress -AddressFamily IPv4 |
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

$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adbDeviceLines = @()
if ($adbCommand) {
  $adbDeviceLines = (& $adbCommand.Source devices) |
    Where-Object { $_ -match "\tdevice$" }
}

Write-Host "Stopping stale Android dev processes."
& (Join-Path $PSScriptRoot "stop-android-dev.ps1")
Write-Host "Clearing hidden Android Studio windows."
& (Join-Path $PSScriptRoot "open-android-studio.ps1") -CleanupOnly
$generatedConfigPath = Join-Path $projectRoot "rust\gen\android\app\src\main\assets\tauri.conf.json"
if (Test-Path -LiteralPath $generatedConfigPath) {
  Remove-Item -LiteralPath $generatedConfigPath -Force
}

$hostAddress = $lanHostAddress
$usesAdbReverse = $false
if ($adbCommand -and $adbDeviceLines.Count -gt 0) {
  $hostAddress = "127.0.0.1"
  $usesAdbReverse = $true
  Write-Host "ADB device found. Using USB reverse for Android dev server."
  & cmd.exe /d /c "`"$($adbCommand.Source)`" reverse --remove tcp:1422 >nul 2>nul"
  & cmd.exe /d /c "`"$($adbCommand.Source)`" reverse --remove tcp:1423 >nul 2>nul"
  & $adbCommand.Source reverse tcp:1422 tcp:1422 | Out-Null
  & $adbCommand.Source reverse tcp:1423 tcp:1423 | Out-Null
  $installedPackage = & $adbCommand.Source shell pm path com.codialo.eko
  if ($installedPackage) {
    Write-Host "Removing previously installed Android dev app to avoid stale devUrl."
    & $adbCommand.Source uninstall com.codialo.eko | Out-Null
  }
} elseif (-not $hostAddress) {
  throw "No LAN IPv4 address or ADB device found for Tauri Android dev. Connect this PC and phone to the same Wi-Fi, or connect the phone with USB debugging."
}

function Test-GeneratedAndroidDevUrl {
  param([string] $ExpectedHost)

  $configPath = Join-Path $projectRoot "rust\gen\android\app\src\main\assets\tauri.conf.json"
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Android Tauri config was not generated at $configPath."
  }

  $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
  $expectedUrl = "http://$ExpectedHost`:1422/"
  $actualUrl = $config.build.devUrl
  if ($actualUrl -ne $expectedUrl) {
    throw "Android devUrl mismatch. Expected $expectedUrl but generated $actualUrl. Stop Android dev and restart with npm run dev:android."
  }

  Write-Host "Verified Android devUrl: $actualUrl"
}

Set-Location -LiteralPath $projectRoot
Write-Host "Starting Tauri Android dev on host $hostAddress."
Write-Host "Using Android Cargo target: $env:CARGO_TARGET_DIR"
Write-Host "Using npm for Android Studio: $env:EKO_NPM_PATH"
if ($usesAdbReverse) {
  Write-Host "ADB reverse active for tcp:1422 and tcp:1423."
}
Write-Host "Android Studio should open. Keep this terminal running, then press Run in Android Studio."
$verifiedDevUrl = $false
& npm.cmd run tauri -- android dev --open --host $hostAddress 2>&1 | ForEach-Object {
  $line = $_.ToString()
  Write-Host $line
  if (-not $verifiedDevUrl -and $line.Contains("Opening Android Studio")) {
    Test-GeneratedAndroidDevUrl -ExpectedHost $hostAddress
    $verifiedDevUrl = $true
  }
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

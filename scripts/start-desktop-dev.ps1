$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$env:CARGO_TARGET_DIR = Join-Path $projectRoot "rust\target\desktop-dev"
$env:EKO_WEB_CLIENT_DEV_URL = "http://localhost:5174"

function Get-LanIp {
  $address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { -not $_.IPAddress.StartsWith("127.") -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress

  if ($address) {
    return $address
  }

  return "127.0.0.1"
}

function Wait-ForPort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [Parameter(Mandatory = $true)]
    [System.Diagnostics.Process]$Process,
    [Parameter(Mandatory = $true)]
    [string]$LogPath,
    [Parameter(Mandatory = $true)]
    [string]$ErrorLogPath
  )

  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    if ($Process.HasExited) {
      Write-Host "Web client dev server exited early."
      if (Test-Path -LiteralPath $LogPath) {
        Get-Content -LiteralPath $LogPath -Tail 40
      }
      if (Test-Path -LiteralPath $ErrorLogPath) {
        Get-Content -LiteralPath $ErrorLogPath -Tail 40
      }
      throw "Web client dev server failed to start."
    }

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connection) {
      return
    }
    Start-Sleep -Milliseconds 250
  }

  throw "Web client dev server did not start on port $Port."
}

Write-Host "Stopping stale desktop dev processes."
& (Join-Path $PSScriptRoot "stop-desktop-dev.ps1")

Set-Location -LiteralPath $projectRoot
$env:PLATFORM = "web/client"
$env:VITE_PORT = "5174"
$env:WEB_CLIENT_DEV_HOST = Get-LanIp
Write-Host "Starting web client dev server at $env:EKO_WEB_CLIENT_DEV_URL."
$logFolder = Join-Path $projectRoot "tmp\desktop-dev"
New-Item -ItemType Directory -Force -Path $logFolder | Out-Null
$webClientLog = Join-Path $logFolder "web-client-vite.log"
$webClientErrorLog = Join-Path $logFolder "web-client-vite-error.log"
Remove-Item -LiteralPath $webClientLog, $webClientErrorLog -Force -ErrorAction SilentlyContinue
$webClientProcess = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev:web:client") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $webClientLog -RedirectStandardError $webClientErrorLog -PassThru
Wait-ForPort -Port 5174 -Process $webClientProcess -LogPath $webClientLog -ErrorLogPath $webClientErrorLog
Write-Host "Web client Vite server is listening on http://localhost:5174."
if (Test-Path -LiteralPath $webClientLog) {
  Get-Content -LiteralPath $webClientLog -Tail 12
}
if (Test-Path -LiteralPath $webClientErrorLog) {
  Get-Content -LiteralPath $webClientErrorLog -Tail 12
}

Remove-Item Env:\PLATFORM -ErrorAction SilentlyContinue
Remove-Item Env:\VITE_PORT -ErrorAction SilentlyContinue
Remove-Item Env:\WEB_CLIENT_DEV_HOST -ErrorAction SilentlyContinue

Write-Host "Starting Tauri desktop dev with Cargo target: $env:CARGO_TARGET_DIR"
try {
  & npm.cmd run tauri -- dev
} finally {
  if ($webClientProcess -and -not $webClientProcess.HasExited) {
    Stop-Process -Id $webClientProcess.Id -Force -ErrorAction SilentlyContinue
  }
}

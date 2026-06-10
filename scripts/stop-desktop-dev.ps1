$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$patterns = @(
  "tauri dev",
  "dev:web:desktop",
  "PLATFORM=desktop",
  "start-desktop-dev.ps1"
)

$currentProcessId = $PID
$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $commandLine = $_.CommandLine
    if (-not $commandLine -or $_.ProcessId -eq $currentProcessId) {
      return $false
    }

    $inProject = $commandLine.Contains($projectRoot)
    $isDesktopDev = $inProject -and ($patterns | Where-Object { $commandLine.Contains($_) })

    $isDesktopDev
  }

foreach ($process in $processes) {
  Write-Host "Stopping desktop dev process $($process.ProcessId)"
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$ports = @(1420, 1421)
$portProcesses = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -ne 0 -and $_.OwningProcess -ne $currentProcessId } |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $portProcesses) {
  Write-Host "Stopping desktop dev port owner $processId"
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

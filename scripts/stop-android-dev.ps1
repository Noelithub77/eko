$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$patterns = @(
  "tauri android dev",
  "dev:web:mobile:tauri",
  "VITE_PORT=1422"
)

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $commandLine = $_.CommandLine
    if (-not $commandLine) {
      return $false
    }

    $inProject = $commandLine.Contains($projectRoot)
    $isProjectAndroidDev = $inProject -and ($patterns | Where-Object { $commandLine.Contains($_) })
    $isTauriAndroidDevWrapper = $commandLine.Contains("tauri android dev")

    $isProjectAndroidDev -or $isTauriAndroidDevWrapper
  }

foreach ($process in $processes) {
  Write-Host "Stopping Android dev process $($process.ProcessId)"
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$ports = @(1422, 1423)
$portProcesses = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -ne 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $portProcesses) {
  Write-Host "Stopping Android dev port owner $processId"
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

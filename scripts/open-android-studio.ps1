$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$androidProject = Join-Path $projectRoot "rust\gen\android"

if (-not (Test-Path -LiteralPath $androidProject)) {
  throw "Android project not found at $androidProject."
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
  $env:EKO_NPM_PATH = $npmCommand.Source
}

function Stop-HiddenAndroidStudio {
  param([string] $ProjectPath)

  $hiddenStudioProcesses = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "studio64.exe" -and
      $_.CommandLine -and
      $_.CommandLine.Contains($ProjectPath)
    } |
    ForEach-Object {
      $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($process -and $process.MainWindowHandle -eq 0) {
        $process
      }
    }

  foreach ($process in $hiddenStudioProcesses) {
    Write-Host "Stopping hidden Android Studio process $($process.Id)"
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
}

Stop-HiddenAndroidStudio -ProjectPath $androidProject

if ($args -contains "-CleanupOnly") {
  return
}

$studioCandidates = @(
  "$env:LOCALAPPDATA\Programs\Android Studio\bin\studio64.exe",
  "$env:ProgramFiles\Android\Android Studio\bin\studio64.exe",
  "${env:ProgramFiles(x86)}\Android\Android Studio\bin\studio64.exe"
)

$studioPath = $studioCandidates |
  Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
  Select-Object -First 1

if ($studioPath) {
  Start-Process -FilePath $studioPath -ArgumentList @($androidProject) -WindowStyle Normal
  Write-Host "Opened Android Studio project: $androidProject"
  return
}

$studioCommand = Get-Command studio -ErrorAction SilentlyContinue
if ($studioCommand) {
  Start-Process -FilePath $studioCommand.Source -ArgumentList @($androidProject)
  Write-Host "Opened Android Studio project: $androidProject"
  return
}

throw "Could not find Android Studio. Open this folder manually: $androidProject"

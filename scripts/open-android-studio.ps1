$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$androidProject = Join-Path $projectRoot "rust\gen\android"

if (-not (Test-Path -LiteralPath $androidProject)) {
  throw "Android project not found at $androidProject."
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
  Start-Process -FilePath $studioPath -ArgumentList @($androidProject)
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

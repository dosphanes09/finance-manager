$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$stopScript = Join-Path $scriptDir "stop-app.ps1"
$startApiScript = Join-Path $scriptDir "start-api.cmd"
$openScript = Join-Path $scriptDir "open-app.ps1"

if (-not (Test-Path $stopScript)) {
  throw "Stop script was not found at $stopScript"
}

if (-not (Test-Path $startApiScript)) {
  throw "Start script was not found at $startApiScript"
}

if (-not (Test-Path $openScript)) {
  throw "Open script was not found at $openScript"
}

Write-Host "Restarting FinanceAnalyzerPro local services..."
& $stopScript
Start-Sleep -Seconds 2
Start-Process -WindowStyle Hidden -FilePath $env:ComSpec -ArgumentList "/c", "`"$startApiScript`""
& $openScript -NoBrowser

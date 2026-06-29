param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$envFile = Join-Path $projectRoot ".env"
$startApiScript = Join-Path $scriptDir "start-api.cmd"
$port = "8080"

if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match "^\s*PORT\s*=\s*`"?([^`"#\s]+)") {
      $port = $Matches[1]
      break
    }
  }
}

$url = "http://127.0.0.1:$port/"

function Test-FinanceAnalyzerPro {
  param([string]$HealthUrl)

  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

if (-not (Test-Path $startApiScript)) {
  throw "Start script was not found at $startApiScript"
}

if (-not (Test-FinanceAnalyzerPro -HealthUrl $url)) {
  Write-Host "FinanceAnalyzerPro is not running. Starting local services..."
  Start-Process -WindowStyle Hidden -FilePath $env:ComSpec -ArgumentList "/c", "`"$startApiScript`""

  $isReady = $false
  for ($attempt = 1; $attempt -le 45; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-FinanceAnalyzerPro -HealthUrl $url) {
      $isReady = $true
      break
    }
  }

  if (-not $isReady) {
    $logPath = Join-Path $env:LOCALAPPDATA "FinanceAnalyzerPro\logs\api.log"
    throw "FinanceAnalyzerPro did not start at $url. Check log: $logPath"
  }
}

Write-Host "Opening FinanceAnalyzerPro at $url"

if (-not $NoBrowser) {
  Start-Process $url
}

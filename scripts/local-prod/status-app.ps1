$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$envFile = Join-Path $projectRoot ".env"
$pgCtl = "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
$pgData = Join-Path $projectRoot ".local\postgres-data"
$port = "8080"

if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match "^\s*PORT\s*=\s*`"?([^`"#\s]+)") {
      $port = $Matches[1]
      break
    }
  }
}

function Test-Port {
  param([int]$Port)

  return (Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet)
}

function Get-ListenerProcess {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $connection) {
    return $null
  }

  return Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
}

$apiRunning = Test-Port -Port ([int]$port)
$postgresPortOpen = Test-Port -Port 5432
$apiProcess = Get-ListenerProcess -Port ([int]$port)

$postgresStatus = "unknown"
if ((Test-Path $pgCtl) -and (Test-Path (Join-Path $pgData "PG_VERSION"))) {
  & $pgCtl -D $pgData status > $null 2>&1
  if ($LASTEXITCODE -eq 0) {
    $postgresStatus = "running"
  } else {
    $postgresStatus = "stopped"
  }
}

Write-Host "FinanceAnalyzerPro local status"
Write-Host "Project root: $projectRoot"
Write-Host "App URL: http://127.0.0.1:$port/"
Write-Host "API port $port open: $apiRunning"
if ($apiProcess) {
  Write-Host "API listener PID: $($apiProcess.ProcessId)"
  Write-Host "API listener executable: $($apiProcess.ExecutablePath)"
}
Write-Host "PostgreSQL port 5432 open: $postgresPortOpen"
Write-Host "Project PostgreSQL data status: $postgresStatus"
Write-Host "Logs: $env:LOCALAPPDATA\FinanceAnalyzerPro\logs"

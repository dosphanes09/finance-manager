param(
  [switch]$KeepPostgres
)

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

function Get-ListenerProcess {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $connection) {
    return $null
  }

  return Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
}

$apiProcess = Get-ListenerProcess -Port ([int]$port)
if ($apiProcess) {
  $commandLine = [string]$apiProcess.CommandLine
  $isNode = [string]$apiProcess.Name -ieq "node.exe"
  $isRelativeProjectStart = $isNode -and
    $commandLine.Contains("./dist/index.mjs") -and
    $commandLine.Contains("--env-file-if-exists=../../.env")
  $isProjectApi = $commandLine.Contains($projectRoot) -or
    $commandLine.Contains("artifacts\api-server\dist\index.mjs") -or
    $isRelativeProjectStart

  if ($isProjectApi) {
    Write-Host "Stopping FinanceAnalyzerPro API on port $port (PID $($apiProcess.ProcessId))..."
    Stop-Process -Id $apiProcess.ProcessId -Force
  } else {
    Write-Host "Port $port is used by another process. It was not stopped."
    Write-Host "PID: $($apiProcess.ProcessId)"
    Write-Host "Executable: $($apiProcess.ExecutablePath)"
  }
} else {
  Write-Host "FinanceAnalyzerPro API is not running on port $port."
}

if ($KeepPostgres) {
  Write-Host "PostgreSQL was left running because -KeepPostgres was provided."
  exit 0
}

if ((Test-Path $pgCtl) -and (Test-Path (Join-Path $pgData "PG_VERSION"))) {
  & $pgCtl -D $pgData status > $null 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Stopping project PostgreSQL..."
    & $pgCtl -D $pgData stop -m fast
    exit $LASTEXITCODE
  }

  Write-Host "Project PostgreSQL is not running."
  exit 0
}

Write-Host "Project PostgreSQL data directory or pg_ctl was not found; nothing to stop."

param(
  [switch]$SkipInstall,
  [switch]$SkipDbPush,
  [switch]$SkipBuild,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$envFile = Join-Path $projectRoot ".env"
$envExample = Join-Path $projectRoot ".env.example"
$startPostgresScript = Join-Path $scriptDir "start-postgres.cmd"
$installPostgresScript = Join-Path $scriptDir "install-postgres-autostart.cmd"
$installApiScript = Join-Path $scriptDir "install-api-autostart.cmd"
$installShortcutScript = Join-Path $scriptDir "install-desktop-shortcut.cmd"
$restartScript = Join-Path $scriptDir "restart-app.ps1"
$openScript = Join-Path $scriptDir "open-app.ps1"
$statusScript = Join-Path $scriptDir "status-app.cmd"

function Invoke-SetupStep {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  $global:LASTEXITCODE = 0
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Assert-Command {
  param([string]$CommandName)

  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "$CommandName was not found on PATH."
  }
}

Write-Host "FinanceAnalyzerPro local app setup"
Write-Host "Project root: $projectRoot"

if (-not (Test-Path $envFile)) {
  if (Test-Path $envExample) {
    throw "Root .env is missing. Copy .env.example to .env and set DATABASE_URL + SESSION_SECRET before running setup."
  }

  throw "Root .env is missing."
}

foreach ($path in @(
  $startPostgresScript,
  $installPostgresScript,
  $installApiScript,
  $installShortcutScript,
  $restartScript,
  $openScript,
  $statusScript
)) {
  if (-not (Test-Path $path)) {
    throw "Required setup dependency was not found: $path"
  }
}

Assert-Command -CommandName "node"
Assert-Command -CommandName "pnpm"

Push-Location $projectRoot
try {
  if (-not $SkipInstall) {
    Invoke-SetupStep -Name "Install workspace dependencies" -Command {
      pnpm install
    }
  }

  Invoke-SetupStep -Name "Start local PostgreSQL" -Command {
    & $startPostgresScript
  }

  if (-not $SkipDbPush) {
    Invoke-SetupStep -Name "Apply local database schema" -Command {
      pnpm --filter "@workspace/db" run push
    }
  }

  if (-not $SkipBuild) {
    Invoke-SetupStep -Name "Build API and frontend" -Command {
      pnpm run build
    }

    Invoke-SetupStep -Name "Restart app with latest build" -Command {
      & $restartScript
    }
  }

  Invoke-SetupStep -Name "Install PostgreSQL autostart" -Command {
    & $installPostgresScript
  }

  Invoke-SetupStep -Name "Install API autostart" -Command {
    & $installApiScript
  }

  Invoke-SetupStep -Name "Create desktop shortcut" -Command {
    & $installShortcutScript
  }

  Invoke-SetupStep -Name "Start and verify local app" -Command {
    & $openScript -NoBrowser:$NoBrowser
  }

  Invoke-SetupStep -Name "Print local app status" -Command {
    & $statusScript
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "FinanceAnalyzerPro local app setup completed."
Write-Host "Open the desktop shortcut or browse to http://127.0.0.1:8080/"

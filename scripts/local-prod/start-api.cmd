@echo off
setlocal

for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
set "ENV_FILE=%PROJECT_ROOT%\.env"
set "API_ENTRY=%PROJECT_ROOT%\artifacts\api-server\dist\index.mjs"
set "WEB_INDEX=%PROJECT_ROOT%\artifacts\finance-app\dist\public\index.html"
set "LOG_DIR=%LOCALAPPDATA%\FinanceAnalyzerPro\logs"
set "API_LOG=%LOG_DIR%\api.log"
set "API_PORT=8080"

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    if /i "%%A"=="PORT" set "API_PORT=%%B"
  )
)

if not exist "%ENV_FILE%" (
  echo Environment file was not found at "%ENV_FILE%".
  exit /b 1
)

if not exist "%API_ENTRY%" (
  echo API build was not found at "%API_ENTRY%".
  echo Run pnpm --filter @workspace/api-server run build first.
  exit /b 1
)

if not exist "%WEB_INDEX%" (
  echo Frontend build was not found at "%WEB_INDEX%".
  echo Run pnpm --filter @workspace/finance-app run build first.
  exit /b 1
)

where node >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Node.js was not found on PATH.
  exit /b 1
)

call "%~dp0start-postgres.cmd"
if not "%ERRORLEVEL%"=="0" (
  exit /b %ERRORLEVEL%
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port %API_PORT% -InformationLevel Quiet) { exit 0 } exit 1" >nul 2>&1
if "%ERRORLEVEL%"=="0" (
  echo FinanceAnalyzerPro API is already running on port %API_PORT%.
  exit /b 0
)

if not exist "%LOG_DIR%" (
  mkdir "%LOG_DIR%" >nul 2>&1
)

echo Starting FinanceAnalyzerPro API on port %API_PORT%.
echo Log: "%API_LOG%"
cd /d "%PROJECT_ROOT%\artifacts\api-server"
node "--env-file-if-exists=%ENV_FILE%" --enable-source-maps "%API_ENTRY%" >> "%API_LOG%" 2>&1
exit /b %ERRORLEVEL%

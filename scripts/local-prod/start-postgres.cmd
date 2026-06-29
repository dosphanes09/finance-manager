@echo off
setlocal

set "PG_CTL=C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
set "PG_DATA=%PROJECT_ROOT%\.local\postgres-data"
set "PG_LOG_DIR=%LOCALAPPDATA%\FinanceAnalyzerPro\logs"
set "PG_LOG=%PG_LOG_DIR%\postgres.log"

if not exist "%PG_CTL%" (
  echo PostgreSQL pg_ctl was not found at "%PG_CTL%".
  exit /b 1
)

if not exist "%PG_DATA%\PG_VERSION" (
  echo PostgreSQL data directory was not found at "%PG_DATA%".
  exit /b 1
)

if not exist "%PG_LOG_DIR%" (
  mkdir "%PG_LOG_DIR%" >nul 2>&1
)

"%PG_CTL%" -D "%PG_DATA%" status >nul 2>&1
if "%ERRORLEVEL%"=="0" (
  echo PostgreSQL is already running.
  exit /b 0
)

"%PG_CTL%" -D "%PG_DATA%" -l "%PG_LOG%" -o "-p 5432 -h localhost" start
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo Failed to start PostgreSQL. Check log: "%PG_LOG%"
  exit /b %EXIT_CODE%
)

echo PostgreSQL started. Log: "%PG_LOG%"
exit /b 0

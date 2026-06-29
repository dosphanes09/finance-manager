@echo off
setlocal

for %%I in ("%~dp0start-postgres.cmd") do set "START_SCRIPT=%%~fI"
set "TASK_NAME=FinanceAnalyzerProPostgres"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_SCRIPT=%STARTUP_DIR%\FinanceAnalyzerPro-Postgres.vbs"

if not exist "%START_SCRIPT%" (
  echo Start script was not found at "%START_SCRIPT%".
  exit /b 1
)

schtasks /Create /F /SC ONLOGON /TN "%TASK_NAME%" /TR "cmd.exe /c ""%START_SCRIPT%""" /RL LIMITED >nul 2>&1
if "%ERRORLEVEL%"=="0" (
  echo Scheduled task "%TASK_NAME%" was created.
  echo It will start PostgreSQL automatically when this Windows user logs in.
  exit /b 0
)

if not exist "%STARTUP_DIR%" (
  mkdir "%STARTUP_DIR%" >nul 2>&1
)

> "%STARTUP_SCRIPT%" echo Set WshShell = CreateObject("WScript.Shell")
>> "%STARTUP_SCRIPT%" echo WshShell.Run "cmd.exe /c ""%START_SCRIPT%""", 0, False

if not exist "%STARTUP_SCRIPT%" (
  echo Failed to create startup launcher at "%STARTUP_SCRIPT%".
  exit /b 1
)

echo Scheduled tasks are not available for this user, so a Startup launcher was created instead.
echo Startup launcher: "%STARTUP_SCRIPT%"
echo It will start PostgreSQL automatically when this Windows user logs in.
exit /b 0

@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-app.ps1" %*
exit /b %ERRORLEVEL%

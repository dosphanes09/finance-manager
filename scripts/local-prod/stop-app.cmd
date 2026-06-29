@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-app.ps1" %*
exit /b %ERRORLEVEL%

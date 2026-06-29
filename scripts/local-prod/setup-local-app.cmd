@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-local-app.ps1" %*
exit /b %ERRORLEVEL%

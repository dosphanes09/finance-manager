@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0status-app.ps1"
exit /b %ERRORLEVEL%

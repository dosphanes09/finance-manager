@echo off
set "PROJECT_DIR=C:\FinanceAnalyzerPro for Claude"

start "FinanceAnalyzerPro - API" cmd /k "cd /d "%PROJECT_DIR%" && pnpm --filter @workspace/api-server run dev"
start "FinanceAnalyzerPro - Web" cmd /k "cd /d "%PROJECT_DIR%" && pnpm --filter @workspace/finance-app run dev"

REM Frontend'in ayaga kalkmasi icin kisa bir bekleme, sonra tarayicida ac.
timeout /t 6 /nobreak >nul
start "" http://localhost:5173

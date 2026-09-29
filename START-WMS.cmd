@echo off
cd /d "%~dp0"

echo =====================================
echo AZI SYSTEM WMS - Start Client + Server
echo =====================================

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  pause
  exit /b 1
)

if not exist client\node_modules (
  echo Client dependencies are missing. Run 1-INSTALL.cmd first.
  pause
  exit /b 1
)
if not exist server\node_modules (
  echo Server dependencies are missing. Run 1-INSTALL.cmd first.
  pause
  exit /b 1
)

node scripts\dev.js
pause

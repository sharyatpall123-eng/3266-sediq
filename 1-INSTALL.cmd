@echo off
cd /d "%~dp0"

echo ========================================
echo AZI SYSTEM WMS - Dependencies Install
echo ========================================

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  pause
  exit /b 1
)

echo.
echo [1/2] Installing client...
call npm install --prefix client
if errorlevel 1 goto :failed

echo.
echo [2/2] Installing server...
call npm install --prefix server
if errorlevel 1 goto :failed

echo.
echo Installation completed successfully.
pause
exit /b 0

:failed
echo.
echo Installation failed. Read the error shown above.
pause
exit /b 1

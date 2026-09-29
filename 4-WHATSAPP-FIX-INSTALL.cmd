@echo off
title AZI WMS - WhatsApp Fix Install
cd /d "%~dp0server"
echo.
echo Installing the WhatsApp compatibility fix...
echo Your WhatsApp session folders will NOT be deleted.
echo.
call npm install
if errorlevel 1 (
  echo.
  echo Installation failed. Check internet connection and try again.
  pause
  exit /b 1
)
echo.
echo Installation completed.
echo Starting AZI WMS server...
echo.
call npm start
pause

@echo off
cd /d "%~dp0"

echo =====================================
echo WMS Pro - Create Supabase Administrator
echo =====================================
echo.
set /p ADMIN_EMAIL=Admin Email: 
set /p ADMIN_USERNAME=Username (example admin): 
set /p ADMIN_NAME=Full Name: 
set /p ADMIN_PASSWORD=Login Code / Password (minimum 8 characters): 

echo.
call npm --prefix server run create:admin -- --email "%ADMIN_EMAIL%" --password "%ADMIN_PASSWORD%" --username "%ADMIN_USERNAME%" --name "%ADMIN_NAME%"
echo.
pause

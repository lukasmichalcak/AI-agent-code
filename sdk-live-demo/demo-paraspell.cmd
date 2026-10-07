@echo off
cd /d "%~dp0"
node demo-paraspell.mjs
echo.
echo Exit status: %errorlevel%. Press any key to close.
pause >nul

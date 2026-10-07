@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is missing. Install Node.js 24 LTS from https://nodejs.org/en/download & exit /b 1)
node --version
call npm ci
if errorlevel 1 exit /b 1
echo Setup finished. Run demo-paraspell.cmd or demo-lifi.cmd.

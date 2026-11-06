@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not available in this Command Prompt.
  echo Open PowerShell in this folder and run: node preview.mjs
  pause
  exit /b 1
)
echo Open http://127.0.0.1:3002/ in Chrome after the server starts.
node preview.mjs
pause

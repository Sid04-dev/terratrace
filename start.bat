@echo off
title TerraTrace server
cd /d "%~dp0"
rem Open the browser 2 seconds from now, after the server has started
start "" /b powershell -NoProfile -Command "Start-Sleep 2; Start-Process http://localhost:8000"
rem Built-in Windows PowerShell web server (no Python needed)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8000
pause

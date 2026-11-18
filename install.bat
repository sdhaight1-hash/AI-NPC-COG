@echo off
setlocal
cd /d "%~dp0"
title AI-NPC-COG - First-time setup
echo.
echo ==============================================
echo   AI-NPC-COG - ONE-CLICK WINDOWS INSTALLER
echo ==============================================
echo.
echo This installer uses your existing GGUF model.
echo It downloads only the tools needed to run it.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if errorlevel 1 goto failed
echo.
echo Setup complete. Starting AI-NPC-COG...
call "%~dp0start.bat"
exit /b %errorlevel%

:failed
echo.
echo Setup did not complete. Read the error above and
echo double-click install.bat again to retry safely.
pause
exit /b 1

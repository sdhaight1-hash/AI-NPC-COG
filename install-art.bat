@echo off
setlocal
cd /d "%~dp0"
title AI-NPC-COG - Install optional CC0 village art
if exist "%~dp0_runtime\art-download-failed.flag" del /q "%~dp0_runtime\art-download-failed.flag"
echo Downloading the optional Kenney Tiny Town CC0 art atlas...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-art.ps1"
if errorlevel 1 (
    echo Art install unavailable; the included original graphics still work.
    pause
    exit /b 1
)
echo.
echo Art installed. Restart the village servers to enable it.
pause
exit /b 0

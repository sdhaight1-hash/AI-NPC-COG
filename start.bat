@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AI-NPC-COG - Launcher
set "ROOT=%~dp0"
set "LLAMA=%ROOT%_runtime\llama\llama-server.exe"
set "MODEL=%ROOT%Model\Rein-NPC-4B-Q4_K_M.gguf"
set "NODE="

if not exist "%LLAMA%" goto missing_server
if not exist "%MODEL%" goto missing_model
if exist "%ROOT%_runtime\node\node.exe" set "NODE=%ROOT%_runtime\node\node.exe"
if not defined NODE (
    for /f "delims=" %%N in ('where node.exe 2^>nul') do (
        if not defined NODE set "NODE=%%N"
    )
)
if not defined NODE goto missing_node

if not exist "%ROOT%public\assets\kenney-tiny-town.png" if not exist "%ROOT%_runtime\art-download-failed.flag" (
    echo Preparing optional CC0 pixel art on first start...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\install-art.ps1"
    if errorlevel 1 (
        echo Optional tileset unavailable. Original pixel art stays active.
        echo Retry by double-clicking install-art.bat.>"%ROOT%_runtime\art-download-failed.flag"
    )
)

echo.
echo Starting Rein-NPC-4B from:
echo   "%MODEL%"
echo.
echo Model server: http://127.0.0.1:8080
echo Village UI:   http://127.0.0.1:5173
echo.
echo Two console windows will open. Keep both open.
echo To stop the simulation, close both windows.
echo.

start "AI-NPC-COG - Rein model" /D "%ROOT%_runtime\llama" "%LLAMA%" -m "%MODEL%" --host 127.0.0.1 --port 8080 -ngl 99 -c 4096 --parallel 1
start "AI-NPC-COG - Village web server" /D "%ROOT%" "%NODE%" "%ROOT%server.mjs"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173"
exit /b 0

:missing_server
echo llama.cpp is not installed. Double-click install.bat first.
goto failed
:missing_model
echo Could not find your model file:
echo   "%MODEL%"
echo Put Rein-NPC-4B-Q4_K_M.gguf in the project's Model folder.
goto failed
:missing_node
echo Node.js is not installed. Double-click install.bat first.
:failed
pause
exit /b 1

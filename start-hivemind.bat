@echo off
setlocal EnableExtensions
set "MODEL_BACKEND=hivemind"
call "%~dp0start.bat"
exit /b %errorlevel%

@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
set "STOP_EXIT=%ERRORLEVEL%"
if not "%STOP_EXIT%"=="0" pause
exit /b %STOP_EXIT%

@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Start
set "START_EXIT=%ERRORLEVEL%"
if not "%START_EXIT%"=="0" pause
exit /b %START_EXIT%

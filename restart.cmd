@echo off
call "%~dp0stop.cmd" || exit /b 1
start "Universal Utility Tool" "%~dp0start.cmd"

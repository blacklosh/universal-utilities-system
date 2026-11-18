@echo off
call "%~dp0stop.cmd" || exit /b 1
call "%~dp0start.cmd"

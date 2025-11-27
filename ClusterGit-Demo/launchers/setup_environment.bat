@echo off
setlocal enabledlayedexpansion

echo ==========================================
echo   ClusterGit Portable Demo Environment
echo ==========================================

::move to project root
cd /d "%~dp0\.."
echo Working directory: %cd%

::add portable git to PATH (temp)
echo Adding Portable Git to PATH...
set PATH=%cd%\portable\git\bin;%cd%\portable\git\usr\bin;%PATH%

::force ssh to use portable home
set HOME=%cd%\portable
echo SSH HOME set to: %HOME%

::open Grafana dashboard
echo Opening Grafana dashboard...
start "" "http://10.27.12.244:31431/"

::open PowerShell window for student demo commands
echo Launching demo PowerShell window...
start powershell -NoExit -Command "cd '%cd%\scripts'"

:: Step 6 — Initial cluster checks (optional but recommended)
::echo Running setup script...
::powershell -ExecutionPolicy Bypass -File "%cd%\scripts\1_setup.ps1"

echo ==========================================
echo Environment ready! Begin the demo.
echo ==========================================
pause
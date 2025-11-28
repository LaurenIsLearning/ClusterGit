@echo off
setlocal enabledelayedexpansion

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
start "" "http://10.27.12.244:31431/d/adnbhgt/clustergit-demo-dashboard?orgId=1&from=now-12h&to=now&timezone=browser&refresh=5s&kiosk=true"

:: Open ONE PowerShell window that loads utilities and triggers all scripts to run
echo Launching demo PowerShell window...
start "" powershell -NoExit -ExecutionPolicy Bypass -Command ^
"cd '%cd%\scripts'; ^
 . .\utilities.ps1; ^
 Write-Host 'Utilities loaded.' -ForegroundColor Cyan; ^
 .\1_setup.ps1; ^
 Read-Host 'Press ENTER to continue to Student Repo Creation...'; ^
 .\2_studentLoginRepo.ps1; ^
 Read-Host 'Press ENTER to continue to Student File Upload...'; ^
 .\3_studentPush.ps1; ^
 Read-Host 'Press ENTER to continue to Auto-Heal Demo...'; ^
 .\4_autoheal.ps1; ^
 Write-Host '==== Demo Complete! ====' -ForegroundColor Green"

echo ==========================================
echo Environment ready! Begin the demo.
echo ==========================================
@REM comment out the one you dont want, i use "pause" for debugging
::pause
exit
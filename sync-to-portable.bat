@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo   ClusterGit Demo - Auto Sync to Portable
echo ==========================================

:: REPO = directory where this script lives (your GitHub repo root)
set REPO=%~dp0

:: Portable environment expected to be next to repo folder
set PORTABLE=%REPO%..\ClusterGit-Demo-Portable\

echo Repo folder:      %REPO%
echo Portable folder:  %PORTABLE%
echo.

:: Check if portable environment exists
if not exist "%PORTABLE%" (
    echo ERROR: Portable environment not found at:
    echo   %PORTABLE%
    echo.
    echo FIX THIS BY:
    echo 1. Extracting ClusterGit-Demo-Portable.zip
    echo 2. Putting it next to your GitHub repo folder.
    pause
    exit /b
)

:: Sync scripts (.ps1 files)
echo Syncing scripts...
robocopy "%REPO%\ClusterGit-Demo\scripts" "%PORTABLE%\scripts" *.ps1 /MIR >nul

:: Sync launchers (.bat files) into launchers folder
echo Syncing launchers...
robocopy "%REPO%\ClusterGit-Demo\launchers" "%PORTABLE%\launchers" *.bat /COPY:DAT /R:1 /W:1 >nul

:: Sync assets (excluding large .bin files due to .gitignore)
echo Syncing assets...
robocopy "%REPO%\ClusterGit-Demo\assets" "%PORTABLE%\assets" *.* /E >nul

echo.
echo ==========================================
echo      SYNC COMPLETE — Portable Updated!
echo ==========================================
echo.

pause
exit /b

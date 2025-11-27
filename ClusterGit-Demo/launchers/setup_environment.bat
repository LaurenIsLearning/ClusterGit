@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo     ClusterGit Portable Demo Setup
echo ==========================================
echo.

REM -----------------------------
REM Detect portable root
REM -----------------------------
set SCRIPT_DIR=%~dp0
set PORTABLE_ROOT=%SCRIPT_DIR%..

echo Portable root located at:
echo %PORTABLE_ROOT%
echo.

REM -----------------------------
REM Add Portable Git to PATH
REM -----------------------------
set GIT_PORTABLE=%PORTABLE_ROOT%\portable\git

if exist "%GIT_PORTABLE%\cmd\git.exe" (
    echo Using Portable Git from: %GIT_PORTABLE%
    set PATH=%GIT_PORTABLE%\cmd;%GIT_PORTABLE%\usr\bin;%PATH%
) else (
    echo ERROR: Portable Git not found in /portable/git
    pause
    exit /b 1
)

git --version
echo.

REM -----------------------------
REM Setup SSH environment
REM -----------------------------
set SSH_DIR=%PORTABLE_ROOT%\keys
set HOME=%PORTABLE_ROOT%

if not exist "%SSH_DIR%\id_rsa" (
    echo ERROR: Missing SSH key: %SSH_DIR%\id_rsa
    pause
    exit /b 1
)

REM Include config if present
set SSH_CONFIG=%PORTABLE_ROOT%\portable\ssh_config

if exist "%SSH_CONFIG%" (
    echo SSH config found: %SSH_CONFIG%
    set GIT_SSH_COMMAND=ssh -F "%SSH_CONFIG%"
) else (
    echo No ssh_config found - using key directly
    set GIT_SSH_COMMAND=ssh -i "%SSH_DIR%\id_rsa" -o StrictHostKeyChecking=no
)

echo SSH environment loaded.
echo.

REM -----------------------------
REM Connectivity check
REM -----------------------------
echo Testing SSH connection to cluster...

%GIT_SSH_COMMAND% student-demo@10.27.12.235 "echo Connected OK"

if %errorlevel% neq 0 (
    echo ERROR: Could not reach cluster over SSH.
    echo Are you on the correct network?
    pause
    exit /b 1
)

echo SSH OK.
echo.

REM -----------------------------
REM Launch terminals & browser
REM -----------------------------
echo Launching environment...

start "" "http://10.27.12.235:3000/d/cluster-overview"

start powershell -NoExit -Command "cd '%PORTABLE_ROOT%\scripts'; echo Ready to run demo scripts."

echo All set!
pause

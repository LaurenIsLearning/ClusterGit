@echo off
setlocal

echo ===============================
echo   ClusterGit Demo - Start
echo ===============================
pause

echo.
echo [1/4] Running setup.ps1 ... (SKIPPING THIS FOR NOW)
rem powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
echo.
pause

echo.
echo [2/4] Running studentLoginRepo.ps1 ...
powershell -ExecutionPolicy Bypass -File "%~dp0studentLoginRepo.ps1"
echo.
pause

echo.
echo [3/4] Running studentPush.ps1 ...
powershell -ExecutionPolicy Bypass -File "%~dp0studentPush.ps1"
echo.
pause

echo.
echo [4/4] Running autoheal.ps1 ...
powershell -ExecutionPolicy Bypass -File "%~dp0autoheal.ps1"
echo.
pause

echo ===============================
echo   ClusterGit Demo - Complete
echo ===============================
pause
endlocal


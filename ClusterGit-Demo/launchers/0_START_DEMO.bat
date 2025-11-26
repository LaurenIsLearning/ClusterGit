@echo off
setlocal

echo ===============================
echo   ClusterGit Demo - Start
echo ===============================
pause

echo.
echo [1/4] Running setup.ps1 ... (SKIPPING THIS FOR NOW)
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\1_setup.ps1"
echo.
pause

echo.
echo [2/4] Running studentLoginRepo.ps1 ...
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\2_studentLoginRepo.ps1"
echo.
pause

echo.
echo [3/4] Running studentPush.ps1 ...
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\3_studentPush.ps1"
echo.
pause

echo.
echo [4/4] Running autoheal.ps1 ...
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\4_autoheal.ps1"
echo.
pause

echo ===============================
echo   ClusterGit Demo - Complete
echo ===============================
pause
endlocal


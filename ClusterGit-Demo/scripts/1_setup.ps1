#set up environment before presentation (browser with dashboards, terminal open)
. "$PSScriptRoot\utilities.ps1"

Write-Section "Setting up Demo Environment" -ForegroundColor Yellow
git --version

Write-Host "Validating portable Git..." -ForegroundColor Yellow
git-annex --version

Write-Section "Testing SSH Connection"
SSH "echo Connected to cluster as student-demo"

Write-Section "Opening Dashboards"

Start-Process "http://10.27.12.244:31431/" # Grafana
Start-Process "https://10.27.12.235:30433" # Longhorn UI
Start-Process "cmd.exe" #terminal for student
Start-Process "cmd.exe" #terminal for admin

Write-Section "Environment Ready"
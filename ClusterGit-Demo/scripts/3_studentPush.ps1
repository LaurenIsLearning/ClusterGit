. "$PSScriptRoot\utilities.ps1"

Write-Host "==== ClusterGit Demo: STUDENT PUSH LARGE FILE ===="
Start-Sleep -Seconds 1

# Git identity (again, defensive)
git config --global user.email "student@example.edu" | Out-Null
git config --global user.name "ClusterGit Demo User" | Out-Null


$StudentRepo = Join-Path $PSScriptRoot "student-repo"
$AssetFile = Join-Path $PSScriptRoot "..\assets\sample-large-file.bin"
$DestFile  = Join-Path $StudentRepo "big-project-file.bin"

Write-Host "Creating README and pushing initial commit..."
Set-Content -Path "$StudentRepo\README.md" -Value "# Demo Repo"

Push-Location $StudentRepo
git add . | Out-Null
git commit -m "Initial commit" | Out-Null

# Set remote ---- NO key, password-only SSH
git remote add origin "ssh://clustergit-pi5-server@10.27.12.244:/srv/git/demo.git"

# First push MUST specify main because Git now defaults to `master` not existing
git branch -M main
git push -u origin main
Pop-Location

Copy-Item $AssetFile $DestFile -Force

Push-Location $StudentRepo

git add big-project-file.bin | Out-Null
git commit -m "Added large demo file" | Out-Null

Write-Host "Uploading large file..."
Start-Sleep -Seconds 1

git push origin main

Pop-Location
Start-Sleep -Seconds 1



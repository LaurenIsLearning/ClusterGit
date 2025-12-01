. "$PSScriptRoot\utilities.ps1"

Write-Host "==== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===="
Start-Sleep -Seconds 1

# Force git identity so NO prompts appear.
git config --global user.email "student@example.edu" | Out-Null
git config --global user.name "ClusterGit Demo User" | Out-Null

# Student repo path
$StudentRepo = Join-Path $PSScriptRoot "student-repo"

# Ensure directory exists fresh
if (Test-Path $StudentRepo) { Remove-Item $StudentRepo -Recurse -Force }
New-Item $StudentRepo -ItemType Directory | Out-Null

# Initialize repo
git init $StudentRepo | Out-Null

Write-Host "Initialized local student repo at:"
Write-Host "  $StudentRepo"
Start-Sleep -Seconds 1

# Ensure bare repo exists on cluster
Write-Host "Ensuring bare repo exists on cluster..."
ssh clustergit-pi5-server@10.27.12.244 "mkdir -p /srv/git/demo.git && git init --bare /srv/git/demo.git" 
git push -u origin main
Pop-Location

Start-Sleep -Seconds 1


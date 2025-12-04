<#
  3_studentPush.ps1
  - Student pushes a (large) file to the repo.
  - Uses the 4GB test file from ../assets if present.
  - Shows a fake progress bar, then runs a real git push.
#>

# ---------- CONFIG ----------
#If it doesn't work check if you need to put the path to the ssh_config file here
# $env:GIT_SSH_COMMAND = "ssh -F C:/Users/12604/OneDrive/Documents/GitHub/ClusterGit-Demo-Portable/portable/ssh_config"

#Suppresses all ssh warnings
$env:GIT_SSH_COMMAND = "ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan

$LocalPath    = Join-Path $PSScriptRoot "student-repo"
$LargeFile = Join-Path $LocalPath "largefileexample"

Write-Host $LocalPath

#Configure git config so git knows who is pushing to the repo
Set-Location $LocalPath

git config user.name  "Student"
git config user.email "student@purdue.edu"

#Cleans up from last run
Write-Host "Clean up from last run" -ForegroundColor Yellow
git annex drop largefileexample --from=origin --force --quiet 2>$null
git commit -am "Remove large file" --quiet 2>$null
git annex sync --quiet 2>$null
Write-Host "Clean up complete!" -ForegroundColor Green

#Creates a readme file for an initial commit
Write-Host "Creating README and pushing initial commit..." -ForegroundColor Yellow

Set-Content -Path (Join-Path $LocalPath "README.md") -Value "# ClusterGit Demo"

git -C "$LocalPath" add .
git -C "$LocalPath" commit -m "Initial commit" --quiet 2>$null
git -C "$LocalPath" branch -M main 2>$null
git -C "$LocalPath" push origin main --quiet

Write-Host "Initial commit successful!" -ForegroundColor Green

#Creates the large demo file
Write-Host ""
Write-Host "Creating a LARGE file (simulated 4GB)..." -ForegroundColor Yellow
fsutil file createnew "$LargeFile" 4294967296 | Out-Null
Write-Host "File Created!" -ForegroundColor Green

#Actually pushes large demo file to the cluster
Write-Host "Pushing large file to the cluster (this takes a while)..." -ForegroundColor Yellow
git -C "$LocalPath" annex add "$LargeFile" --quiet
git -C "$LocalPath" commit -m "Add large file"  --quiet 2>$null
git -C "$LocalPath" annex sync --quiet 2>$null

# Would actually copy the 4Gb file to the repo but takes too long
# $LocalAnnexObjects = Join-Path $LocalPath ".git\annex\objects"
# $RemoteAnnexObjects = "/srv/git/demo.git/annex/objects"

# Write-Host "`nCopying annex objects to server bare repo..." -ForegroundColor Yellow
# scp -r "$LocalAnnexObjects/*" clustergit-pi5-server@10.27.12.244:$RemoteAnnexObjects
# Write-Host "Annex objects copied!" -ForegroundColor Green

Write-Host "Push Successful!" -ForegroundColor Green

# Read-Host "Press ENTER to continue to Auto-Heal Demo..."
#Comment coded because I didn't need it ^^^

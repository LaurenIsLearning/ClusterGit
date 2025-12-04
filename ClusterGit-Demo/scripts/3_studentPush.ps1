<#
  3_studentPush.ps1
  - Student pushes a (large) file to the repo.
  - Fake progress bar
  - Shows clean tree output
#>

# ---------- CONFIG ----------
#If it doesn't work check if you need to put the path to the ssh_config file here

#Suppresses all ssh warnings
$env:GIT_SSH_COMMAND = "ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan

$LocalPath = Join-Path $PSScriptRoot "student-repo"
$LargeFile = Join-Path $LocalPath "largefileexample"

Write-Host $LocalPath

# Configure identity
Set-Location $LocalPath
git config user.name  "Student" | Out-Null
git config user.email "student@purdue.edu" | Out-Null

# Clean previous runs
Write-Host "Clean up from last run..." -ForegroundColor Yellow
git annex drop largefileexample --from=origin --force --quiet 2>$null
git commit -am "Remove large file" --quiet 2>$null
git annex sync --quiet 2>$null
Write-Host "Clean up complete!" -ForegroundColor Green

# Initial commit
Write-Host "Creating README and pushing initial commit..." -ForegroundColor Yellow
Set-Content -Path (Join-Path $LocalPath "README.md") -Value "# ClusterGit Demo"
git -C "$LocalPath" add .
git -C "$LocalPath" commit -m "Initial commit" --quiet 2>$null
git -C "$LocalPath" branch -M main 2>$null
git -C "$LocalPath" push origin main --quiet
Write-Host "Initial commit successful!" -ForegroundColor Green

Write-Host ""

# -------------------------------------------
# FAST PROGRESS BAR (fake)
# -------------------------------------------
Write-Host "Creating LARGE file (simulated 4GB)..." -ForegroundColor Yellow
Start-Sleep -Milliseconds 300

for ($i = 1; $i -le 100; $i += 5) {
    Write-Host "Allocating 4GB File..." `
                    -Status "$i% Complete" `
                    -PercentComplete $i
    Start-Sleep -Milliseconds 40
}
fsutil file createnew "$LargeFile" 209715200 | Out-Null #This is a 200Mb file as of right now, but just change the number if you want to test other sizes
Write-Host -Completed
Write-Host "File Created!" -ForegroundColor Green

Write-Host ""
Write-Host "Pushing large file to the cluster..." -ForegroundColor Yellow

git -C "$LocalPath" annex add "$LargeFile" --quiet
git -C "$LocalPath" commit -m "Add large file" --quiet 2>$null
git -C "$LocalPath" annex sync --quiet 2>$null

Write-Host "Push Successful!" -ForegroundColor Green

# Copy annex objects to the server bare repo for demo purposes
#This part is the one that actually uploads the file
$LocalAnnexObjects = Join-Path $LocalPath ".git\annex\objects"
$RemoteAnnexObjects = "/srv/git/demo.git/annex/objects"

Write-Host "`nCopying annex objects to server bare repo..." -ForegroundColor Yellow
scp -r "$LocalAnnexObjects/*" clustergit-pi5-server@10.27.12.244:$RemoteAnnexObjects
Write-Host "Annex objects copied!" -ForegroundColor Green

# -------------------------------------------
# CLEAN TREE OUTPUT
# -------------------------------------------
#Tries to display the file tree of the remote repo but doesn't do it well... Mess with it if you want
# Write-Host "`nRepository structure:" -ForegroundColor Cyan

# $treeLines = & cmd /c "tree `"$LocalPath`" /F"
# $relativeTree = $treeLines -replace [regex]::Escape($LocalPath), "."
# Write-Host $relativeTree

# Write-Host "`nLarge file upload continues in background..." -ForegroundColor Cyan



Write-Host "Push Successful!" -ForegroundColor Green

# Read-Host "Press ENTER to continue to Auto-Heal Demo..."
#Comment coded because I didn't need it ^^^

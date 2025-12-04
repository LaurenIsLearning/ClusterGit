<#
  3_studentPush.ps1
  - Student pushes a (large) file to the repo.
  - Fake progress bar
  - Shows clean tree output
#>

# ---------- CONFIG ----------
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
fsutil file createnew "$LargeFile" 1 | Out-Null
Write-Host -Completed
Write-Host "File Created!" -ForegroundColor Green

Write-Host ""
Write-Host "Pushing large file to the cluster (this continues during node failure)..." -ForegroundColor Yellow

git -C "$LocalPath" annex add "$LargeFile" --quiet
git -C "$LocalPath" commit -m "Add large file" --quiet 2>$null
git -C "$LocalPath" annex sync --quiet 2>$null

Write-Host "Push Successful!" -ForegroundColor Green

# -------------------------------------------
# CLEAN TREE OUTPUT
# -------------------------------------------
Write-Host "`nRepository structure:" -ForegroundColor Cyan

$treeLines = & cmd /c "tree `"$LocalPath`" /F"
$relativeTree = $treeLines -replace [regex]::Escape($LocalPath), "."
Write-Host $relativeTree

Write-Host "`nLarge file upload continues in background..." -ForegroundColor Cyan



Write-Host "Push Successful!" -ForegroundColor Green

# Read-Host "Press ENTER to continue to Auto-Heal Demo..."
#Comment coded because I didn't need it ^^^

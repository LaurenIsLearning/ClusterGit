# 3_studentPush.ps1 – fixed fatal error
# Configure commit identity locally (suppresses "tell me who you are" error)
git config user.name "Student Demo"
git config user.email "student@purdue.edu"

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan

$RepoPath = "C:\CAPSTONE\ClusterGit-Demo-Portable\scripts\student-repo"
$LargeFile = Join-Path $RepoPath "largefileexample"

Write-Host "Creating README and pushing initial commit..."

Set-Content -Path (Join-Path $RepoPath "README.md") -Value "# ClusterGit Demo"

git -C "$RepoPath" add .
git -C "$RepoPath" commit -m "Initial commit"
git -C "$RepoPath" branch -M main
git -C "$RepoPath" push origin main

Write-Host ""
Write-Host "Repository structure:"
cmd /c "tree $RepoPath /f"

Write-Host ""
Write-Host "Uploading LARGE file (simulated 4GB)..."

Write-Host "Creating dummy file..."
fsutil file createnew "$LargeFile" 4294967296 | Out-Null

git -C "$RepoPath" annex add "$LargeFile"
git -C "$RepoPath" commit -m "Add large file"
git -C "$RepoPath" annex sync

Write-Host "Large file upload started..."
Read-Host "Press ENTER to continue to Auto-Heal Demo..."

# 3_studentPush.ps1 — Clean & reliable push

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

# Enforce correct working directory
$scriptDir = Split-Path -Parent $PSCommandPath
Set-Location $scriptDir

$LocalRepo = Join-Path $scriptDir "student-repo"
if (!(Test-Path $LocalRepo)) {
    Write-Host "ERROR: student-repo missing. Run 2_studentLoginRepo.ps1 first." -ForegroundColor Red
    exit 1
}
Set-Location $LocalRepo

git config user.name "Student" >$null
git config user.email "student@purdue.edu" >$null

# Initial commit
Write-Host "Creating README and pushing initial commit..."
"ClusterGit demo repository" | Set-Content README.md
git add README.md >$null
git commit -m "Initial commit" >$null

Write-Host "Current repository contents:"
ls

Write-Host "`nStaged files:"
git status --short

git push -u origin main 2>$null

# Fake large upload progress
Write-Host "`nUploading LARGE file (simulated 4GB)..."
$File = "big-project-file.bin"
fsutil file createnew $File 104857600 >$null  # 100MB demo instead of 4GB

1..20 | ForEach-Object {
    $pct = $_ * 5
    Write-Progress -Activity "Uploading large file..." -PercentComplete $pct
    Start-Sleep -Milliseconds 150
}
Write-Progress -Activity "Uploading large file..." -Completed

git add $File >$null
git commit -m "Add large project file" >$null

Write-Host "`nStaged files after large upload:"
git status --short

Write-Host "`nCommitting and pushing to cluster..."
git push origin main 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Large file upload started successfully. Continue demo during transfer..." -ForegroundColor Green
} else {
    Write-Host "ERROR: Push failed" -ForegroundColor Red
}

Read-Host "Press ENTER to continue to Auto-Heal Demo..."


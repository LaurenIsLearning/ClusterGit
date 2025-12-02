<#
  3_studentPush.ps1
  - Student pushes a (large) file to the repo.
  - Uses the 4GB test file from ../assets if present.
  - Shows a fake progress bar, then runs a real git push.
#>

# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
$AssetsDir       = Join-Path $PSScriptRoot
$RepoBigFileName = "big-project-file.bin"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo $LocalWorkDir not found. Run 2_studentLoginRepo.ps1 first." -ForegroundColor Red
    exit 1
}

Set-Location $LocalWorkDir

# Use local identity just for this repo (no global config needed)
git config user.name  "Student"
git config user.email "student@purdue.edu"

$sshConfig = "ssh -i `"$KeyPath`""

#Deletes pushed file for next demo run
git rm $DemoBigFile >$null 2>&1
git commit -m "Clean up for next run" >$null 2>&1

git -c core.sshCommand="$sshConfig" push origin main

# 1) Initial commit & push
Write-Host "Creating README and pushing initial commit..."
"ClusterGit demo repository" | Set-Content -Encoding utf8 "README.md"

git add README.md >$null 2>&1
git commit -m "Initial commit" >$null 2>&1

git -c core.sshCommand="$sshConfig" push -u origin main

# 2) Large file commit & push
Write-Host "Uploading large file..."

if (-not (Test-Path $SourceBigFile)) {
    Write-Host "ERROR: sample large file not found at $SourceBigFile" -ForegroundColor Red
    Read-Host "Press ENTER to continue to Auto-Heal Demo..."
    exit 1
}

Copy-Item $SourceBigFile $DemoBigFile -Force

git add $DemoBigFile >$null 2>&1
git commit -m "Add large project file" >$null 2>&1

git -c core.sshCommand="$sshConfig" push origin main

if ($LASTEXITCODE -eq 0){
  Write-Host "Push Successful!" -ForegroundColor Green
}

Read-Host "Press ENTER to continue to Auto-Heal Demo..."
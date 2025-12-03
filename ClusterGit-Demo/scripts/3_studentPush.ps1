# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

$SSH = "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
$AssetsDir       = Join-Path $PSScriptRoot
$SourceBigFile   = Join-Path $AssetsDir "sample-large-file.bin"
$DemoBigFile     = "big-project-file.bin"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo $LocalWorkDir not found." -ForegroundColor Red
    exit 1
}

Set-Location $LocalWorkDir
git config user.name  "Student"
git config user.email "student@purdue.edu"

Write-Host "Creating README and pushing initial commit..."
"ClusterGit demo repository" | Set-Content -Encoding utf8 "README.md"

git add README.md >$null 2>&1
git commit -m "Initial commit" >$null 2>&1
git -c core.sshCommand="$SSH" push -u origin main

Write-Host "Uploading large file..."

if (-not (Test-Path $SourceBigFile)) {
    Write-Host "ERROR: sample large file not found." -ForegroundColor Red
    Read-Host "Press ENTER to continue"
    exit 1
}

Copy-Item $SourceBigFile $DemoBigFile -Force

git add $DemoBigFile >$null 2>&1
git commit -m "Add large project file" >$null 2>&1
git -c core.sshCommand="$SSH" push origin main

git rm $DemoBigFile >$null 2>&1
git commit -m "Clean up for next run" >$null 2>&1
git -c core.sshCommand="$SSH" push origin main

Read-Host "Press ENTER to continue to Auto-Heal Demo..."

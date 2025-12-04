<#
  3_studentPush.ps1
  Phase 3: Upload large file, simulate heavy workload
#>

# Force Git to use custom SSH config and suppress warnings
$env:GIT_SSH_COMMAND = "ssh -F C:/CAPSTONE/ClusterGit-Demo-Portable/portable/ssh_config"

# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"
$RemoteUrl = "ssh://$ClusterUser@$ClusterHost$RemoteRepoPath"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
$DemoBigFile     = Join-Path $LocalWorkDir "big-project-file.bin"
$SourceBigFile   = Join-Path $PSScriptRoot "big-project-file.bin"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo not found. Run 2_studentLoginRepo.ps1 first." -ForegroundColor Red
    Read-Host "Press ENTER to continue..."
    exit 1
}

Set-Location $LocalWorkDir

git config user.name  "Student"
git config user.email "student@purdue.edu"

Write-Host "Creating README and pushing initial commit..."
"ClusterGit demo repository" | Set-Content -Encoding utf8 "README.md"
git add README.md >$null 2>&1
git commit -m "Initial commit" >$null 2>&1
git push origin main 2>$null

# Show current repo tree
Write-Host "`nCurrent repository contents:"
Get-ChildItem | Format-Table Name
Write-Host ""

# Large file upload
Write-Host "`nUploading LARGE file (simulated 4GB)..."
if (-not (Test-Path $SourceBigFile)) {
    Write-Host "Creating dummy 4GB test file for upload..."
    fsutil file createnew $SourceBigFile 4000000000 >$null
}

Copy-Item $SourceBigFile $DemoBigFile -Force

# Better progress simulation
$total = 50
for ($i=1; $i -le $total; $i++) {
    $percent = [math]::Round(($i / $total) * 100)
    Write-Progress -Activity "Uploading to ClusterGit..." -Status "$percent% Complete" -PercentComplete $percent
    Start-Sleep -Milliseconds 150
}

Write-Host "`nCommitting and pushing..."
git add $DemoBigFile >$null 2>&1
git commit -m "Add large project file" >$null 2>&1
git push origin main 2>$null

Write-Host ""
Write-Host "Large file upload started. Continue demo during transfer..." -ForegroundColor Green

Read-Host "Press ENTER to continue to Auto-Heal Demo..."



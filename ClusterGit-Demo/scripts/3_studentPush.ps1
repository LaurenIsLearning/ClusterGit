<# 
  3_studentPush.ps1
  - First real commit (README)
  - Push to cluster
  - Upload large file with git-annex
#>

# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

# FIXED URL BUILDING
$RemoteUrl       = "ssh://$ClusterUser@${ClusterHost}:$RemoteRepoPath"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"

$AssetsDir       = Join-Path $PSScriptRoot "..\assets"
$SourceBigFile   = Join-Path $AssetsDir "sample-large-file.bin"
$DemoBigFile     = "big-project-file.bin"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan

# Ensure repo exists
if (!(Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local student repo not found."
    exit 1
}

Set-Location $LocalWorkDir

# ----- First commit -----
Write-Host "Creating README and pushing initial commit..."

"Student project repository" | Out-File -Encoding UTF8 README.md

git add README.md
git commit -m "Initial commit" --author="Student <student@purdue.edu>"

# Push initial commit
git push $RemoteUrl main

# ----- Upload large file -----
Write-Host "Uploading large file..."

Copy-Item $SourceBigFile $DemoBigFile -Force
git annex add $DemoBigFile
git commit -m "Uploading large project file"
git annex copy $DemoBigFile --to origin

git push $RemoteUrl main

Read-Host "Press ENTER to continue to Auto-Heal Demo..."




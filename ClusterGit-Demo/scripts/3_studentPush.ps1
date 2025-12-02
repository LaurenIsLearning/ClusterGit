<#
  3_studentPush.ps1
  - Use the cloned student-repo
  - Create README and push first commit
  - Add large file, commit, push again
  - Git-only on Windows (no git-annex here)
#>

# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"
$RemoteUrl       = "ssh://$ClusterUser@${ClusterHost}:$RemoteRepoPath"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"

$AssetsDir       = Join-Path $PSScriptRoot "..\assets"
$SourceBigFile   = Join-Path $AssetsDir "sample-large-file.bin"
$DemoBigFile     = "big-project-file.bin"

$KeyPath         = Join-Path $PSScriptRoot "..\portable\keys\id_rsa"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ==="

# Ensure local repo exists
if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: $LocalWorkDir not found. Run 2_studentLoginRepo.ps1 first." -ForegroundColor Red
    Read-Host "Press ENTER to continue to Auto-Heal Demo..."
    exit 1
}

Set-Location $LocalWorkDir

# Use local identity just for this repo (no global config needed)
git config user.name  "Student"
git config user.email "student@purdue.edu"

$sshConfig = "ssh -i `"$KeyPath`""

# 1) Initial commit & push
Write-Host "Creating README and pushing initial commit..."
"ClusterGit demo repository" | Set-Content -Encoding utf8 "README.md"

git add README.md
git commit -m "Initial commit" | Out-Null

git -c core.sshCommand="$sshConfig" push -u origin main

# 2) Large file commit & push
Write-Host "Uploading large file..."

if (-not (Test-Path $SourceBigFile)) {
    Write-Host "ERROR: sample large file not found at $SourceBigFile" -ForegroundColor Red
    Read-Host "Press ENTER to continue to Auto-Heal Demo..."
    exit 1
}

Copy-Item $SourceBigFile $DemoBigFile -Force

git add $DemoBigFile
git commit -m "Add large project file" | Out-Null

git -c core.sshCommand="$sshConfig" push origin main

Read-Host "Press ENTER to continue to Auto-Heal Demo..."


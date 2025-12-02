<# 
  2_studentLoginRepo.ps1
  - Fake “login”
  - Create EMPTY /srv/git/demo.git on the cluster
  - Create EMPTY local student-repo
  - Clone empty repo (no commits yet)
#>

# ---------- CONFIG ----------
$DemoUserEmail   = "student@purdue.edu"
$DemoUserToken   = "DEMO_FAKE_TOKEN"

$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

# FIXED URL BUILDING
$RemoteUrl       = "ssh://$ClusterUser@${ClusterHost}:$RemoteRepoPath"


$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host "Email : $DemoUserEmail"
Write-Host "Token : $($DemoUserToken.Substring(0,8))***"
Read-Host "Press ENTER to continue"

# ----- Reset local repo -----
Write-Host "Recreating local repo folder..."
if (Test-Path $LocalWorkDir) { Remove-Item -Recurse -Force $LocalWorkDir }
New-Item -ItemType Directory -Path $LocalWorkDir | Out-Null

# ----- Reset cluster bare repo -----
Write-Host "`nEnsuring empty bare repo exists on the cluster at $RemoteRepoPath ..."
ssh "$ClusterUser@$ClusterHost" @"
rm -rf $RemoteRepoPath
mkdir -p /srv/git
git init --bare $RemoteRepoPath
cd $RemoteRepoPath
git annex init
"@ 2>$null

# ----- Clone empty repo -----
Write-Host "`nStudent cloning clean repository from the cluster..."
git clone $RemoteUrl $LocalWorkDir

Write-Host "`nLocal clone created successfully."
Read-Host "Press ENTER to continue to Student File Upload..."


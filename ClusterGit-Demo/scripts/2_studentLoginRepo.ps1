<# 
  2_studentLoginRepo.ps1
  - Fake “login”
  - Reset EMPTY /srv/git/demo.git on the cluster
  - Create local student-repo and clone empty repo
#>

# ---------- CONFIG ----------
$DemoUserEmail = "student@purdue.edu"
$DemoUserToken = "DEMO_FAKE_TOKEN"

$ClusterUser   = "clustergit-pi5-server"
$ClusterHost   = "10.27.12.244"
$RemoteRepoPath = "/srv/git/demo.git"

# Remote URL (note the colon after host is part of scp-style syntax)
$RemoteUrl = "ssh://$ClusterUser@$ClusterHost:$RemoteRepoPath"

$LocalWorkDir = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host "Email : $DemoUserEmail"
Write-Host "Token : $($DemoUserToken.Substring(0,8))***"
Read-Host "Press ENTER to continue"

# ----- Reset local repo -----
Write-Host ""
Write-Host "Recreating local repo folder..."
if (Test-Path $LocalWorkDir) {
    Remove-Item -Recurse -Force $LocalWorkDir
}
New-Item -ItemType Directory -Path $LocalWorkDir | Out-Null

# ----- Reset cluster bare repo (one shell line, no CR garbage) -----
Write-Host ""
Write-Host "Ensuring empty bare repo exists on the cluster at $RemoteRepoPath ..."
$remoteCmd = "rm -rf $RemoteRepoPath && mkdir -p /srv/git && cd /srv/git && git init --bare demo.git"
Invoke-ClusterSSH $remoteCmd

# ----- Clone empty repo -----
Write-Host ""
Write-Host "Student cloning clean repository from the cluster..."
git clone $RemoteUrl $LocalWorkDir

Write-Host ""
Write-Host "Local clone created successfully."
Read-Host "Press ENTER to continue to Student File Upload..."

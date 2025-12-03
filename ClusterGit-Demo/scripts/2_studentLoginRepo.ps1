<#
  2_studentLoginRepo.ps1
  Phase 2: Student Login + Repo Setup
#>

# Force Git to use custom SSH config and suppress warnings
$env:GIT_SSH_COMMAND = "ssh -F C:/CAPSTONE/ClusterGit-Demo-Portable/portable/ssh_config"

# ---------- CONFIG ----------
$DemoUserEmail   = "student@purdue.edu"
$DemoUserToken   = "DEMO_FAKE_TOKEN"

$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

# Correct URL format
$RemoteUrl       = "ssh://$ClusterUser@$ClusterHost:$RemoteRepoPath"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host "Email : $DemoUserEmail"
Write-Host "Token : $($DemoUserToken.Substring(0,8))***"
Read-Host "Press ENTER to continue"

# Reset local repo
Write-Host "Recreating local repo folder..."
if (Test-Path $LocalWorkDir) { Remove-Item -Recurse -Force $LocalWorkDir }
New-Item -ItemType Directory -Path $LocalWorkDir | Out-Null

# Reset cluster bare repo
Write-Host "`nEnsuring empty bare repo exists on the cluster at $RemoteRepoPath ..."
ssh $ClusterUser@$ClusterHost @"
rm -rf $RemoteRepoPath
mkdir -p /srv/git
git init --bare $RemoteRepoPath
cd $RemoteRepoPath
git annex init
"@ 2>$null

# Clone repo
Write-Host "`nCloning repository from ClusterGit to student machine..."
git clone $RemoteUrl $LocalWorkDir 2>$null

Write-Host "`nRepository clone created successfully."
Write-Host ""
Write-Host "Local repo tree:"
Get-ChildItem $LocalWorkDir | Format-Table Name
Write-Host ""

Read-Host "Press ENTER to continue to Student File Upload..."


Write-Host ""
Write-Host "Local repo created successfully (no commits yet)."
Read-Host "Press ENTER to continue to Student File Upload..."


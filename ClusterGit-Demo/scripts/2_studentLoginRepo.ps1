<#
  2_studentLoginRepo.ps1
  - Fake “login”
  - Create EMPTY /srv/git/demo.git on the cluster
  - Create EMPTY local student-repo (no commits yet)
  - Wire local repo to the cluster remote (no push yet)
#>

# ---------- CONFIG ----------
$DemoUserEmail   = "student@purdue.edu"
$DemoUserToken   = "DEMO_FAKE_TOKEN"

$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

# IMPORTANT: use ${ClusterHost} so ':' is not parsed as a drive letter
$RemoteUrl       = "ssh://$ClusterUser@${ClusterHost}:$RemoteRepoPath"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
# Common SSH flags: no host-key prompt, no known_hosts file, hide warnings
$SshFlags        = @(
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR"
)
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

# ----- Reset cluster bare repo (empty, no commits) -----
Write-Host ""
Write-Host "Ensuring empty bare repo exists on the cluster at $RemoteRepoPath ..."
$remoteCmd = @"
rm -rf '$RemoteRepoPath'
mkdir -p /srv/git
git init --bare '$RemoteRepoPath'
"@

& ssh @SshFlags "$ClusterUser@$ClusterHost" $remoteCmd 2>$null

# ----- Create EMPTY local repo wired to remote (no push yet) -----
Write-Host ""
Write-Host "Creating empty local student repo linked to the cluster remote..."
Push-Location $LocalWorkDir

git init >$null 2>&1

# make sure 'origin' points at the cluster
git remote remove origin  *> $null 2>&1
git remote add origin $RemoteUrl

Pop-Location

Write-Host ""
Write-Host "Local repo created successfully (no commits yet)."
Read-Host "Press ENTER to continue to Student File Upload..."


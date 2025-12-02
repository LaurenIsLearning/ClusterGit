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
$RemoteUrl       = "ssh://$ClusterUser@${ClusterHost}:$RemoteRepoPath"

# Paths relative to scripts folder
$PortableRoot    = Resolve-Path (Join-Path $PSScriptRoot "..\portable")
$SshExe          = Join-Path $PortableRoot "git\usr\bin\ssh.exe"
$KeyPath         = Join-Path $PortableRoot "keys\id_rsa"

# This is the local working repo
$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

# Make git (clone/push) use the same SSH + key, and silence warnings
$env:GIT_SSH_COMMAND = "`"$SshExe`" -i `"$KeyPath`" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

# Base SSH args for direct ssh calls
$SshBaseArgs = @(
    "-i", $KeyPath,
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR"
)

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host "Email : $DemoUserEmail"
Write-Host "Token : $($DemoUserToken.Substring(0,8))***"
Read-Host "Press ENTER to continue"

# ----- Reset local repo (folder only, no git yet) -----
Write-Host "Recreating local repo folder..."
if (Test-Path $LocalWorkDir) {
    Remove-Item -Recurse -Force $LocalWorkDir
}

# DO NOT create directory here; git clone will create it

# ----- Reset cluster bare repo (with git-annex init on server) -----
Write-Host ""
Write-Host "Ensuring empty bare repo exists on the cluster at $RemoteRepoPath ..."

& $SshExe @SshBaseArgs "$ClusterUser@$ClusterHost" `
  "rm -rf $RemoteRepoPath && mkdir -p /srv/git && git init --bare $RemoteRepoPath && cd $RemoteRepoPath && git-annex init ClusterGitDemo || true" `
  | Out-Null

# ----- Clone empty repo -----
Write-Host ""
Write-Host "Student cloning clean repository from the cluster..."
git clone $RemoteUrl $LocalWorkDir 2>&1 | Write-Host

Write-Host ""
Write-Host "Local clone created successfully."
Read-Host "Press ENTER to continue to Student File Upload..."


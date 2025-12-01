<# 
  2_studentLoginRepo.ps1
  - Fake “login”
  - Create /srv/git/demo.git on the cluster if needed
  - Create local student-repo and push an initial commit
#>

# ---------- CONFIG ----------
$DemoUserEmail   = "student@purdue.edu"
$DemoUserToken   = "DEMO_FAKE_TOKEN_1234"

$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"

# Bare repo on the cluster
$RemoteRepoPath  = "/srv/git/demo.git"

# IMPORTANT: build URL with string concatenation so PowerShell
# doesn't mis-parse the ':' after $ClusterHost
$RemoteUrl       = "ssh://$ClusterUser@" + $ClusterHost + ":" + $RemoteRepoPath

# Local working directory for student
$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pretend student logs in using a token-based CLI."
Write-Host "Email : $DemoUserEmail"
Write-Host "Token : $($DemoUserToken.Substring(0,8))***"
Write-Host ""
Read-Host "Explain the login flow to the audience, then press ENTER to continue"

# Clean any previous run
if (Test-Path $LocalWorkDir) {
    Write-Host "Cleaning existing local repo at $LocalWorkDir..."
    Remove-Item -Recurse -Force $LocalWorkDir
}
New-Item -ItemType Directory -Path $LocalWorkDir | Out-Null
Set-Location $LocalWorkDir
git init >$null 2>&1
git annex init >$null 2>&1

# Local repo init
Write-Host ""
Write-Host "Ensuring bare repo exists on the cluster at $RemoteRepoPath ..."
ssh "$ClusterUser@$ClusterHost" "mkdir -p /srv/git && git init --bare && git annex init $RemoteRepoPath >/dev/null 2>&1 || true"

#Clones created repository to the students machine
Write-Host ""
Write-Host "Student is cloning the repository from the cluster"
git clone $RemoteUrl $LocalWorkDir >$null 2>&1
Set-Location $LocalWorkDir
git remote add origin $RemoteUrl | Out-Null

Write-Host ""
Write-Host "Local history:"
git log --oneline -5
Write-Host ""
Write-Host "On the cluster you can show:"
Write-Host "  ssh $ClusterUser@$ClusterHost"
Write-Host "  cd $RemoteRepoPath"
Write-Host "  git log --oneline"
Write-Host ""

<# 
  2_studentLoginRepo.ps1
  - Fake login
  - Ensure remote repo exists but stays EMPTY
  - Prepare a clean local clone
#>

# ---------- CONFIG ----------
$DemoUserEmail   = "student@purdue.edu"
$DemoUserToken   = "DEMO_FAKE_TOKEN_1234"

$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

$RemoteUrl       = "ssh://$ClusterUser@" + $ClusterHost + ":" + $RemoteRepoPath

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pretend student logs in using a token-based CLI."
Write-Host "Email : $DemoUserEmail"
Write-Host "Token : $($DemoUserToken.Substring(0,8))***"
Write-Host ""
Read-Host "Explain the login flow to the audience, then press ENTER to continue"

# 1. Clean any previous local repo
if (Test-Path $LocalWorkDir) {
    Write-Host "Cleaning existing local repo at $LocalWorkDir..."
    Remove-Item -Recurse -Force $LocalWorkDir
}
Write-Host "Recreating local repo folder..."
New-Item -ItemType Directory -Path $LocalWorkDir | Out-Null

# 2. Ensure cluster repo exists BUT remains empty
Write-Host ""
Write-Host "Ensuring empty bare repo exists on the cluster at $RemoteRepoPath ..." -ForegroundColor Yellow
ssh "$ClusterUser@$ClusterHost" "rm -rf $RemoteRepoPath && mkdir -p /srv/git && git init --bare $RemoteRepoPath >/dev/null 2>&1"

# 3. Clone the clean remote repo
Write-Host ""
Write-Host "Student cloning clean repository from the cluster..." -ForegroundColor Yellow
git clone $RemoteUrl $LocalWorkDir | Out-Null

Write-Host ""
Write-Host "Local clone created successfully."
Write-Host "Press ENTER to continue to Student File Upload..." -ForegroundColor Yellow



<#
  2_studentLoginRepo.ps1
  - Fake “login”
  - Ensure /srv/git/demo.git exists on the cluster
  - Create local student-repo and push an initial commit
#>

# ---------- CONFIG ----------
$DemoUserEmail   = "student@example.edu"
$DemoUserToken   = "DEMO_FAKE_TOKEN_1234"

$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"

# Bare repo on the cluster
$RemoteRepoPath  = "/srv/git/demo.git"
$RemoteUrl       = "ssh://$ClusterUser@$ClusterHost:$RemoteRepoPath"

# Local working directory for student
$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pretend student logs in using a token-based CLI."
Write-Host "Email : $DemoUserEmail"
Write-Host "Token : $($DemoUserToken.Substring(0, [Math]::Min(8, $DemoUserToken.Length)))***"
Write-Host ""
Read-Host "Explain the login flow to the audience, then press ENTER to continue"

# Clean any previous run
if (Test-Path $LocalWorkDir) {
    Write-Host "Cleaning existing local repo at $LocalWorkDir..."
    Remove-Item -Recurse -Force $LocalWorkDir
}
New-Item -ItemType Directory -Path $LocalWorkDir | Out-Null
Set-Location $LocalWorkDir

# Local repo init
git init | Out-Null
"ClusterGit demo repository" | Out-File -Encoding utf8 "README.md"
git add README.md
git commit -m "Initial commit from student" | Out-Null

Write-Host ""
Write-Host "Ensuring bare repo exists on the cluster at $RemoteRepoPath ..."
ssh "$ClusterUser@$ClusterHost" "mkdir -p $RemoteRepoPath && git init --bare $RemoteRepoPath >/dev/null 2>&1 || true"

# Make sure origin points at the right place
git remote remove origin 2>$null
git remote add origin $RemoteUrl

Write-Host ""
Write-Host "Pushing initial commit to the cluster remote..."
$pushOutput = git push -u origin master 2>&1
Write-Host $pushOutput

if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: git push failed (see above)." -ForegroundColor Yellow
    Write-Host "For the demo you can still talk through the flow and then show logs on the server manually."
} else {
    Write-Host ""
    Write-Host "Repository is now created on the cluster." -ForegroundColor Green
}

Write-Host ""
Write-Host "Local history:"
git log --oneline -5
Write-Host ""
Write-Host "On the cluster you can show:"
Write-Host "  ssh $ClusterUser@$ClusterHost"
Write-Host "  cd $RemoteRepoPath"
Write-Host "  git log --oneline"
Write-Host ""

Write-Host "  ssh $ClusterUser@$ClusterHost"
Write-Host "  cd $RemoteRepoPath"
Write-Host "  git log --oneline"
Write-Host ""


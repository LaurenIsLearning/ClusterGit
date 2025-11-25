#student logs in, creates repo, views repo

# ---------- CONFIG ----------
$DemoUserEmail   = "student@example.edu"
$DemoUserToken = "DEMO_FAKE_TOKEN_ABC123"
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"

# Remote bare repo on the cluster:
$RemoteRepoPath = "/srv/git/demo.git"
$RemoteUrl = "ssh://clustergit-pi5-server@10.27.12.244:/srv/git/demo.git"

# Local working directory for the student's clone:
$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pretend student logs in using a token-based CLI."
Write-Host "Email : $DemoUserEmail"
Write-Host "Token : $( $DemoUserToken.Substring(0,8) )***"Write-Host ""
Read-Host "Explain the login flow to the audience, then press ENTER to continue"

if (Test-Path $LocalWorkDir) {
    Write-Host "Cleaning existing local repo at $LocalWorkDir..."
    Remove-Item -Recurse -Force $LocalWorkDir
}
New-Item -ItemType Directory -Path $LocalWorkDir | Out-Null

Set-Location $LocalWorkDir

Write-Host ""
Write-Host "Initializing a new local git repo to simulate 'create repository'..."
git init | Out-Null

Write-Host "Adding README.md..."
"ClusterGit demo repository" | Out-File -Encoding utf8 "README.md"

git add README.md
git commit -m "Initial commit from student" | Out-Null

Write-Host ""
Write-Host "Connecting to the cluster remote:"
Write-Host "Mock: Connecting to cluster..."
git remote add origin $RemoteUrl

Write-Host ""
Write-Host "Pushing initial commit to the cluster..."
git push -u origin master 2>&1 | Write-Host

Write-Host ""
Write-Host "Repository is now created on the cluster."
Write-Host "Local tree:"
git log --oneline -5
Write-Host ""
Write-Host "At this pause you can switch to the cluster shell and run:"
Write-Host "  cd $RemoteRepoPath && git log --oneline"
Write-Host "to show that the commit really landed on the server."
Write-Host ""

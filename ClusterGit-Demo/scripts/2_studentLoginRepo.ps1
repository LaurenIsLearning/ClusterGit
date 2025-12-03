# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

$SSH = "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
$RemoteUrl = "ssh://$ClusterUser@$ClusterHost:$RemoteRepoPath"

$LocalWorkDir = Join-Path $PSScriptRoot "student-repo"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT LOGIN & REPO SETUP ===" -ForegroundColor Cyan
Write-Host "Email : student@purdue.edu"
Write-Host "Token : DEMO_FAK***"
Read-Host "Press ENTER to continue"

Write-Host "Recreating local repo folder..."
if (Test-Path $LocalWorkDir) { Remove-Item -Recurse -Force $LocalWorkDir }
New-Item -ItemType Directory -Path $LocalWorkDir | Out-Null

Write-Host "`nEnsuring empty bare repo exists on the cluster at $RemoteRepoPath ..."
& $SSH "$ClusterUser@$ClusterHost" @"
rm -rf $RemoteRepoPath
mkdir -p /srv/git
git init --bare $RemoteRepoPath
cd $RemoteRepoPath
git annex init
"@ 2>$null

Write-Host "`nStudent cloning clean repository from the cluster..."
git -c core.sshCommand="$SSH" clone $RemoteUrl $LocalWorkDir

Write-Host "`nLocal clone created successfully."
Read-Host "Press ENTER to continue to Student File Upload..."



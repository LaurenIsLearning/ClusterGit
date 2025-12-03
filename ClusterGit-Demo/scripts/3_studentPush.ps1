<#
  3_studentPush.ps1
  - Student pushes an initial README commit.
  - Then adds a large file and pushes again.
  - Uses sample-large-file.bin from ../assets.
  - Shows a fake progress bar for the large upload.
#>

# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"
$RemoteUrl       = "ssh://$ClusterUser@${ClusterHost}:$RemoteRepoPath"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
$AssetsDir       = Join-Path $PSScriptRoot "..\assets"
$SourceBigFile   = Join-Path $AssetsDir "sample-large-file.bin"
$DemoBigFile     = "big-project-file.bin"

# SSH flags for git so we don't see the "Permanently added" spam
$SshCommandForGit = "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo $LocalWorkDir not found. Run 2_studentLoginRepo.ps1 first." -ForegroundColor Red
    Read-Host "Press ENTER to continue to Auto-Heal Demo..."
    exit 1
}

Push-Location $LocalWorkDir

# Make sure repo is on 'main' and has identity
git checkout -B main         >$null 2>&1
git config user.name  "Student"         >$null 2>&1
git config user.email "student@purdue.edu" >$null 2>&1

# 1) Initial README commit & push
Write-Host "Creating README and pushing initial commit..."

"ClusterGit demo repository" | Set-Content -Encoding utf8 "README.md"

git add README.md                 >$null 2>&1
git commit -m "Initial commit"    >$null 2>&1

git -c core.sshCommand="$SshCommandForGit" push -u origin main 2>$null

# 2) Large file commit & push
Write-Host ""
Write-Host "Uploading large file..."

if (-not (Test-Path $SourceBigFile)) {
    Write-Host "ERROR: sample large file not found at $SourceBigFile" -ForegroundColor Red
    Pop-Location
    Read-Host "Press ENTER to continue to Auto-Heal Demo..."
    exit 1
}

# Copy large file into repo
Copy-Item $SourceBigFile $DemoBigFile -Force

git add $DemoBigFile                     >$null 2>&1
git commit -m "Add large project file"   >$null 2>&1

# --- Fake progress bar (purely cosmetic) ---
$steps = 20
for ($i = 1; $i -le $steps; $i++) {
    $filled = "#" * $i
    $empty  = "." * ($steps - $i)
    $pct    = [int](($i / $steps) * 100)
    Write-Host ("[{0}{1}] {2,3}%%" -f $filled, $empty, $pct)
    Start-Sleep -Milliseconds 120
}
Write-Host "[####################] 100%  (simulated)"
Write-Host ""

# Real push of the large file commit
git -c core.sshCommand="$SshCommandForGit" push origin main 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Push Successful!" -ForegroundColor Green
}

# Optional cleanup so the demo can be rerun without manual git surgery
git rm $DemoBigFile                  >$null 2>&1
git commit -m "Clean up for next run" >$null 2>&1
git -c core.sshCommand="$SshCommandForGit" push origin main 2>$null

Pop-Location

Read-Host "Press ENTER to continue to Auto-Heal Demo..."


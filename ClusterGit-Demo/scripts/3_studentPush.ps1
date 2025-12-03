<# 
  3_studentPush.ps1
  - Student pushes initial commit
  - Then pushes a large file (with fake progress bar)
#>

# ---------- CONFIG ----------
$ClusterUser      = "clustergit-pi5-server"
$ClusterHost      = "10.27.12.244"
$RemoteRepoPath   = "/srv/git/demo.git"

$LocalWorkDir     = Join-Path $PSScriptRoot "student-repo"
# Assets dir is the demo root; large file lives in ../assets
$AssetsDir        = Join-Path $PSScriptRoot "..\assets"
$SourceBigFile    = Join-Path $AssetsDir "sample-large-file.bin"
$RepoBigFileName  = "big-project-file.bin"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo $LocalWorkDir not found. Run 2_studentLoginRepo.ps1 first." -ForegroundColor Red
    Read-Host "Press ENTER to continue to Auto-Heal Demo..."
    exit 1
}

Set-Location $LocalWorkDir

# Local identity for this repo only
git config user.name  "Student"  | Out-Null
git config user.email "student@purdue.edu" | Out-Null

# Make sure we're on branch 'main' (create/reset if needed)
git checkout -B main *> $null

# 1) Initial README commit & push
Write-Host "Creating README and pushing initial commit..."
"ClusterGit demo repository" | Set-Content -Encoding utf8 "README.md"

git add README.md      *> $null
git commit -m "Initial commit from student" *> $null

git push -u origin main

# 2) Large file commit & push
Write-Host ""
Write-Host "Uploading large file..."

if (-not (Test-Path $SourceBigFile)) {
    Write-Host "ERROR: sample large file not found at $SourceBigFile" -ForegroundColor Red
    Read-Host "Press ENTER to continue to Auto-Heal Demo..."
    exit 1
}

# Copy big file into repo
Copy-Item $SourceBigFile $RepoBigFileName -Force

git add $RepoBigFileName *> $null
git commit -m "Add large project file" *> $null

# Fake progress bar
for ($i = 0; $i -le 100; $i += 5) {
    $bars  = "#" * ($i / 5)
    $space = " " * ((100 - $i) / 5)
    Write-Host -NoNewline ("`r[{0}{1}] {2}%%" -f $bars, $space, $i)
    Start-Sleep -Milliseconds 120
}
Write-Host ""

# Real push
git push origin main

Write-Host ""
Write-Host "Push completed. Local repository tree (main branch):"
git ls-tree --name-only -r main

Write-Host ""
Read-Host "Press ENTER to continue to Auto-Heal Demo..."

if ($LASTEXITCODE -eq 0){
  Write-Host "Push Successful!" -ForegroundColor Green
}

Read-Host "Press ENTER to continue to Auto-Heal Demo..."

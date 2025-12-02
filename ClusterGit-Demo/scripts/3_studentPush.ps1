<#
  3_studentPush.ps1
  - Student pushes a (large) file to the repo.
  - Uses the test file from ../assets if present.
  - Shows a fake progress bar, then does real git push.
#>

# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

$PortableRoot    = Resolve-Path (Join-Path $PSScriptRoot "..\portable")
$SshExe          = Join-Path $PortableRoot "git\usr\bin\ssh.exe"
$KeyPath         = Join-Path $PortableRoot "keys\id_rsa"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
$AssetsDir       = Resolve-Path (Join-Path $PSScriptRoot "..\assets")
$SourceBigFile   = Join-Path $AssetsDir "sample-large-file.bin"
$DemoBigFile     = "big-project-file.bin"
# -----------------------------

# Make git use the same SSH + key, silence warnings
$env:GIT_SSH_COMMAND = "`"$SshExe`" -i `"$KeyPath`" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo $LocalWorkDir not found. Run 2_studentLoginRepo.ps1 first." -ForegroundColor Red
    exit 1
}

Set-Location $LocalWorkDir

# Local identity for this repo only
git config user.name  "Student"        | Out-Null
git config user.email "student@purdue.edu" | Out-Null

# 1) Initial README commit & push (only if not already there)
Write-Host "Creating README and pushing initial commit..."

if (-not (Test-Path "README.md")) {
    "ClusterGit demo repository" | Set-Content -Encoding utf8 "README.md"
    git add README.md    >$null 2>&1
    git commit -m "Initial commit" >$null 2>&1
} else {
    Write-Host "README.md already exists; re-using it."
}

git push -u origin main 2>&1 | Write-Host

# 2) Large file commit & progress bar + push
Write-Host "Uploading large file..."

if (-not (Test-Path $SourceBigFile)) {
    Write-Host "Test file not found at $SourceBigFile" -ForegroundColor Yellow
    Write-Host "Generating a dummy ~50MB file instead..."
    $sizeBytes = 50MB
    $fs = [System.IO.File]::Create($DemoBigFile)
    $fs.SetLength($sizeBytes)
    $fs.Close()
} else {
    Copy-Item $SourceBigFile $DemoBigFile -Force
}

git add $DemoBigFile >$null 2>&1
git commit -m "Add large project file" >$null 2>&1

Write-Host "Simulated upload progress:"
for ($i = 0; $i -le 100; $i += 5) {
    $bar   = "#" * ($i / 5)
    $space = " " * ((100 - $i) / 5)
    Write-Host -NoNewline ("`r[{0}{1}] {2}%%" -f $bar, $space, $i)
    Start-Sleep -Milliseconds 150
}
Write-Host ""

git push origin main 2>&1 | Write-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "Push Successful!" -ForegroundColor Green
} else {
    Write-Host "WARNING: git push reported an error (see above)." -ForegroundColor Yellow
}

# Optional cleanup so you can re-run demo cleanly
git rm $DemoBigFile >$null 2>&1
git commit -m "Clean up for next run" >$null 2>&1
git push origin main 2>&1 | Write-Host

Read-Host "Press ENTER to continue to Auto-Heal Demo..."

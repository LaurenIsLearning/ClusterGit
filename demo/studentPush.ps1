<#
  studentPush.ps1
  - Add a big file to student-repo
  - Show a CLI progress bar
  - Push to the same cluster remote
#>

# ---------- CONFIG ----------
$ClusterUser   = "clustergit-pi5-server"
$ClusterHost   = "10.27.12.244"
$RemoteRepoPath= "/srv/git/demo.git"
$RemoteUrl     = "ssh://$ClusterUser@$ClusterHost:$RemoteRepoPath"

$LocalWorkDir  = Join-Path $PSScriptRoot "student-repo"

# Optional real source file (e.g., USB). If missing, we create a dummy file.
$SourceBigFile = "E:\big-demo-file.bin"
$DemoBigFile   = "big-project-file.bin"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo $LocalWorkDir not found. Run studentLoginRepo.ps1 first." -ForegroundColor Red
    exit 1
}

Set-Location $LocalWorkDir

# Ensure origin is correct (in case of previous experiments)
git remote remove origin 2>$null
git remote add origin $RemoteUrl 2>$null

# Prepare the big file
if (Test-Path $SourceBigFile) {
    Write-Host "Copying big file from $SourceBigFile into repo as $DemoBigFile..."
    Copy-Item $SourceBigFile $DemoBigFile -Force
} else {
    Write-Host "Source big file not found at $SourceBigFile."
    Write-Host "Generating a dummy ~50MB file as $DemoBigFile for the demo..."
    $sizeBytes = 50MB
    $fs = [System.IO.File]::Create($DemoBigFile)
    $fs.SetLength($sizeBytes)
    $fs.Close()
}

if (-not (Test-Path $DemoBigFile)) {
    Write-Host "ERROR: $DemoBigFile still not found; aborting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Staging big file..."
git add $DemoBigFile

Write-Host "Committing..."
git commit -m "Add large project file for grading" 2>$null | Out-Null

Write-Host ""
Write-Host "Upload progress..."
for ($i = 0; $i -le 100; $i += 5) {
    $bar   = "#" * ($i / 5)
    $space = " " * ((100 - $i) / 5)
    Write-Host -NoNewline ("`r[{0}{1}] {2}%%" -f $bar, $space, $i)
    Start-Sleep -Milliseconds 150
}
Write-Host "`r[####################] 100%"

Write-Host ""
Write-Host "Synchronizing with remote (git pull --rebase) to avoid non-fast-forward errors..."
git pull --rebase origin master 2>$null | Out-Null

Write-Host "Now performing the git push to the cluster remote..."
$pushOutput = git push origin master 2>&1
Write-Host $pushOutput

if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: git push failed (see hints in the output above)." -ForegroundColor Yellow
} else {
    Write-Host "Push completed successfully." -ForegroundColor Green
}

Write-Host ""
Write-Host "At this point in the talk you can:"
Write-Host "  - SSH to the cluster and show the file/commit in $RemoteRepoPath."
Write-Host "  - Explain that real ClusterGit would store the *large bits* via git-annex/Longhorn"
Write-Host "    and only keep metadata keys in Supabase."
Write-Host ""


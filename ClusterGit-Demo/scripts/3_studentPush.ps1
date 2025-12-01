<#
  3_studentPush.ps1
  - Student pushes a (large) file to the repo.
  - Uses the 4GB test file from ../assets if present.
  - Shows a fake progress bar, then runs a real git push.
#>

# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
$AssetsDir       = Join-Path $PSScriptRoot "..\assets"
$RepoBigFileName = "big-project-file.bin"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo $LocalWorkDir not found. Run 2_studentLoginRepo.ps1 first." -ForegroundColor Red
    exit 1
}

Set-Location $LocalWorkDir

# Decide source big file
$SourceBigFile = $null
if (Test-Path $AssetsDir) {
    $bigCandidate = Get-ChildItem $AssetsDir -File | Sort-Object Length -Descending | Select-Object -First 1
    if ($bigCandidate) {
        $SourceBigFile = $bigCandidate.FullName
        Write-Host "Using large demo file from assets:"
        Write-Host "  $SourceBigFile"
    }
}

$TargetBigFile = Join-Path $LocalWorkDir $RepoBigFileName

if ($SourceBigFile) {
    Write-Host ""
    Write-Host "Copying large file into repo as $RepoBigFileName..."
    Copy-Item $SourceBigFile $TargetBigFile -Force
} else {
    Write-Host ""
    Write-Host "No large file found in $AssetsDir."
    Write-Host "Generating a dummy ~50MB file as $RepoBigFileName for the demo..."
    $sizeBytes = 50MB
    $fs = [System.IO.File]::Create($TargetBigFile)
    $fs.SetLength($sizeBytes)
    $fs.Close()
}

Write-Host ""
Write-Host "Staging large file..."
git add $RepoBigFileName

Write-Host "Committing..."
git commit -m "Add large project file for grading" | Out-Null

Write-Host ""
Write-Host "Simulated upload progress:"
for ($i = 0; $i -le 100; $i += 5) {
    $bar   = "#" * ($i / 5)
    $space = " " * ((100 - $i) / 5)
    Write-Host -NoNewline ("`r[{0}{1}] {2}%%" -f $bar, $space, $i)
    Start-Sleep -Milliseconds 150
}
Write-Host ""
Write-Host ""

Write-Host "Now performing the actual git push to the cluster remote..."
$pushOutput = git push origin master 2>&1
Write-Host $pushOutput

if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: git push failed (see above)." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Large file push completed successfully." -ForegroundColor Green
}

Write-Host ""
Write-Host "On the cluster you can show:"
Write-Host "  ssh $ClusterUser@$ClusterHost"
Write-Host "  cd $RemoteRepoPath"
Write-Host "  ls -lh"
Write-Host "  git log --oneline"
Write-Host ""



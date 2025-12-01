<# 
  3_studentPush.ps1
  - First commit + push
  - Add large file + push
#>

# ---------- CONFIG ----------
$ClusterUser     = "clustergit-pi5-server"
$ClusterHost     = "10.27.12.244"
$RemoteRepoPath  = "/srv/git/demo.git"

# IMPORTANT: DO NOT BREAK THIS LINE
$RemoteUrl       = "ssh://$ClusterUser@$ClusterHost:$RemoteRepoPath"

$LocalWorkDir    = Join-Path $PSScriptRoot "student-repo"
$AssetsDir       = Join-Path $PSScriptRoot "..\assets"
$SourceBigFile   = Join-Path $AssetsDir "sample-large-file.bin"
$DemoBigFile     = "big-project-file.bin"
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo not found. Run 2_studentLoginRepo.ps1 first!" -ForegroundColor Red
    exit 1
}

Set-Location $LocalWorkDir

# Ensure we are on main branch
git switch main 2>$null
git switch -c main 2>$null

# Ensure remote origin is set
git remote remove origin 2>$null
git remote add origin $RemoteUrl

### FIRST COMMIT ###
Write-Host "Creating README and pushing initial commit..." -ForegroundColor Yellow
"ClusterGit demo repository" | Out-File -Encoding utf8 "README.md"
git add README.md
git commit -m "Initial commit from student" | Out-Null

git push -u origin main --force

### LARGE FILE ###
Write-Host "Uploading large file..." -ForegroundColor Yellow

if (Test-Path $SourceBigFile) {
    Copy-Item $SourceBigFile $DemoBigFile -Force
} else {
    Write-Host "Large file missing, creating dummy 50MB file..." -ForegroundColor Yellow
    $sizeBytes = 50MB
    $fs = [System.IO.File]::Create($DemoBigFile)
    $fs.SetLength($sizeBytes)
    $fs.Close()
}

git add $DemoBigFile
git commit -m "Add big project file" | Out-Null

git push origin main --force

Set-Location $PSScriptRoot

Write-Host "Press ENTER to continue to Auto-Heal Demo..." -ForegroundColor Yellow
Read-Host > $null




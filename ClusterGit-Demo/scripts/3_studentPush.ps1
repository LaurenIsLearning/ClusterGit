# ---------- CONFIG ----------
$env:GIT_SSH_COMMAND = "ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan

$LocalPath    = Join-Path $PSScriptRoot "student-repo"
$LargeFile = Join-Path $LocalPath "largefileexample"

Write-Host $LocalPath

# Configure identity
Set-Location $LocalPath
git config user.name  "Student" | Out-Null
git config user.email "student@purdue.edu" | Out-Null

# Clean previous runs
Write-Host "Clean up from last run" -ForegroundColor Yellow
git annex drop largefileexample --from=origin --force --quiet 2>$null
git commit -am "Remove large file" --quiet 2>$null
git annex sync --quiet 2>$null
Write-Host "Clean up complete!" -ForegroundColor Green

# Initial commit
Write-Host "Creating README and pushing initial commit..." -ForegroundColor Yellow
Set-Content -Path (Join-Path $LocalPath "README.md") -Value "# ClusterGit Demo"
git -C "$LocalPath" add .
git -C "$LocalPath" commit -m "Initial commit" --quiet 2>$null
git -C "$LocalPath" branch -M main 2>$null
git -C "$LocalPath" push origin main --quiet
Write-Host "Initial commit successful!" -ForegroundColor Green

Write-Host ""

# -------------------------------------------
# PROGRESS BAR ADDITION
# -------------------------------------------
Write-Host "Creating a LARGE file (simulated 4GB)..." -ForegroundColor Yellow

# 4GB in 200MB chunks for progress feedback
$chunkSize = 200MB
$totalSize = 4GB
$iterations = [math]::Ceiling($totalSize / $chunkSize)
$progress = 0

# Create empty file first
fsutil file createnew "$LargeFile" 1 | Out-Null

$stream = [System.IO.File]::OpenWrite($LargeFile)
try {
    for ($i = 1; $i -le $iterations; $i++) {
        $null = $stream.Seek($chunkSize, 'Current')
        $progress = [math]::Round(($i / $iterations) * 100)
        Write-Progress -Activity "Allocating 4GB File..." `
                        -Status "$progress% Complete" `
                        -PercentComplete $progress
    }
}
finally {
    $stream.Close()
}
Write-Host "File Created!" -ForegroundColor Green

Write-Host ""
Write-Host "Pushing large file to the cluster (this takes a while)..." -ForegroundColor Yellow
git -C "$LocalPath" annex add "$LargeFile" --quiet
git -C "$LocalPath" commit -m "Add large file"  --quiet 2>$null
git -C "$LocalPath" annex sync --quiet 2>$null

Write-Host "Push Successful!" -ForegroundColor Green

# -------------------------------------------
# TREE-STYLE OUTPUT ADDITION
# -------------------------------------------
Write-Host "`nRepository structure:" -ForegroundColor Cyan

$tree = & cmd /c "tree `"$LocalPath`" /F"
Write-Host $tree

Write-Host "`nLarge file upload started..." -ForegroundColor Cyan


Write-Host "Push Successful!" -ForegroundColor Green

# Read-Host "Press ENTER to continue to Auto-Heal Demo..."
#Comment coded because I didn't need it ^^^

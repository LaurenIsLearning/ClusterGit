#student pushes to repo, progress bar of upload, view repo with files after upload
#it would be cool to see what node the data is stored on so i can kill that node for auto healing to see where the data goes
#it should be replicated, so cool to see where that is too. this might be something for longhorn UI but unsure rn

<#
  studentPush.ps1
  - Student pushes a (possibly large) file to the repo.
  - Shows a simple CLI progress bar and then git push output.
#>

# ---------- CONFIG ----------
$ClusterUser   = "clustergit-pi5-server"
$ClusterHost   = "10.27.12.244"
$RemoteRepoPath = "/srv/git/demo.git"
$RemoteUrl = "ssh://clustergit-pi5-server@10.27.12.244:/srv/git/demo.git"

$LocalWorkDir  = Join-Path $PSScriptRoot "student-repo"

# Source big file for the demo (e.g., from USB). If not found, we generate one.
$SourceBigFile = "E:\big-demo-file.bin"   # CHANGE if you want to use a flash drive
$DemoBigFile   = "big-project-file.bin"   # filename inside the repo
# -----------------------------

Write-Host "=== ClusterGit Demo: STUDENT PUSH LARGE FILE ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $LocalWorkDir)) {
    Write-Host "ERROR: Local repo $LocalWorkDir not found. Run studentLoginRepo.ps1 first." -ForegroundColor Red
    exit 1
}

Set-Location $LocalWorkDir

# Prepare big file
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

Write-Host ""
Write-Host "Staging big file..."
git add $DemoBigFile

Write-Host "Committing..."
git commit -m "Add large project file for grading" | Out-Null

Write-Host ""
Write-Host "upload progress..."

for ($i = 0; $i -le 100; $i += 5) {
    $bar = "#" * ($i / 5)
    $space = " " * ((100 - $i) / 5)
    Write-Host -NoNewline ("`r[{0}{1}] {2}%" -f $bar, $space, $i)
    Start-Sleep -Milliseconds 200
}
Write-Host ""

Write-Host ""
Write-Host "Now performing the actual git push to the cluster remote..."
git push origin master 2>&1 | Write-Host

Write-Host ""
Write-Host "At this point in the talk you can:"
Write-Host "  - Show that the file exists in the remote repo."
Write-Host "  - Explain that in the real system, Git-annex would offload this file"
Write-Host "    to Longhorn-backed storage, and we only store keys in Supabase."
Write-Host ""

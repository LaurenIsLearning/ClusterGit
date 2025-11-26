function Write-Section {
    param([string]$Text)
    Write-Host "`n==== $Text ====" -ForegroundColor Cyan
 }
 function Write-Green($t) { Write-Host $t -ForegroundColor Green }
 function Write-Red($t)   { Write-Host $t -ForegroundColor Red }
 function Write-Yellow($t){ Write-Host $t -ForegroundColor Yellow }
 function SSH {
    param([string]$cmd)
    $key = "$PSScriptRoot\..\keys\student-demo"
    ssh -i $key -o StrictHostKeyChecking=no student-demo@10.27.12.235 $cmd
 }
 function Show-ProgressBar {
    param(
        [int]$Duration = 20,
        [string]$Message = "Working..."
    )
    for ($i = 0; $i -le $Duration; $i++) {
        $percent = [math]::Round(($i / $Duration) * 100)
        Write-Progress -Activity $Message -Status "$percent% Complete" -PercentComplete $percent
        Start-Sleep -Milliseconds 300
    }
 }
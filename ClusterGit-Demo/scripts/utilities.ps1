$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Section {
    param([string]$Text)
    Write-Host "`n==== $Text ====" -ForegroundColor Cyan
}
function Write-Green($t) { Write-Host $t -ForegroundColor Green }
function Write-Red($t) { Write-Host $t -ForegroundColor Red }
function Write-Yellow($t) { Write-Host $t -ForegroundColor Yellow }

# Renamed to avoid recursion!
function Invoke-ClusterSSH {
    param([string]$cmd)

    $config = "$ScriptRoot\..\portable\ssh_config"

    if (Test-Path $config) {

        # Explicit path to ssh.exe so PowerShell does NOT call this function
        $sshExe = Resolve-Path "$ScriptRoot\..\portable\git\usr\bin\ssh.exe"

        # debug
         Write-Host "SSH Path = $sshExe" -ForegroundColor Yellow

        & $sshExe -F $config cluster "$cmd"

    }
    else {

        $key = "$ScriptRoot\..\portable\keys\id_rsa"
        $sshExe = "$ScriptRoot\..\portable\git\usr\bin\ssh.exe"

        & $sshExe `
            -i $key `
            -o StrictHostKeyChecking=no `
            -o UserKnownHostsFile=/dev/null `
            student-demo@10.27.12.244 "$cmd"
    }
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

# ------Generate portable SSH config dynamically
$PortableRoot = Resolve-Path (Join-Path $ScriptRoot "..\portable")
$KeyPath = Join-Path $PortableRoot "keys\id_rsa"
$SSHConfigPath = Join-Path $PortableRoot "ssh_config"
$SSHExe = Join-Path $PortableRoot "git\usr\bin\ssh.exe"

Write-Host "Writing ssh_config to: $SSHConfigPath" -ForegroundColor Cyan

# Convert Windows paths to SSH-friendly forward slashes
$SSHExe        = $SSHExe -replace '\\','/'
$SSHConfigPath = $SSHConfigPath -replace '\\','/'
$KeyPath       = $KeyPath -replace '\\','/'

#build ssh_config dynamically
$SSHConfig = @"
Host *
    User student-demo
    IdentityFile $KeyPath
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null

Host cluster
    HostName 10.27.12.244

Host pi-server 10.27.12.244
    User student-demo

Host pi-worker4 10.27.12.233
    User student-demo
"@

# Write ssh_config file
$SSHConfig | Out-File $SSHConfigPath -Encoding ascii
 
 #force git to use portable ssh
$env:GIT_SSH_COMMAND = "$SSHExe -F $SSHConfigPath"

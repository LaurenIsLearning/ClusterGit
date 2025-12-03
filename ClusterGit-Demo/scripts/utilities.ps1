<# 
  utilities.ps1
  - Shared helpers for ClusterGit demo
  - Sets up portable SSH with quiet logging (no hostkey spam)
#>

# Basic colored output helpers
function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "==== $Text ====" -ForegroundColor Cyan
}

function Write-Green {
    param([string]$Text)
    Write-Host $Text -ForegroundColor Green
}

function Write-Yellow {
    param([string]$Text)
    Write-Host $Text -ForegroundColor Yellow
}

function Write-Red {
    param([string]$Text)
    Write-Host $Text -ForegroundColor Red
}

# ---- Portable SSH wiring ----

# DemoRoot    = C:\CAPSTONE\ClusterGit-Demo-Portable
# Scripts dir = C:\CAPSTONE\ClusterGit-Demo-Portable\scripts
# Portable    = C:\CAPSTONE\ClusterGit-Demo-Portable\portable

$ScriptRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
$DemoRoot     = Split-Path -Parent $ScriptRoot
$PortableDir  = Join-Path $DemoRoot "portable"

# Git for Windows ssh.exe
$Global:SshExePath    = Join-Path $PortableDir "git\usr\bin\ssh.exe"
$Global:SshConfigPath = Join-Path $PortableDir "ssh_config"

function Initialize-PortableSSH {
    if (-not (Test-Path $PortableDir)) {
        Write-Red "ERROR: portable directory not found at: $PortableDir"
        return
    }

    # Minimal config: accept hostkeys quietly, no known_hosts, no info-level spam
    $configContent = @"
Host *
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    LogLevel ERROR
"@

    $configContent | Set-Content -Encoding ascii $Global:SshConfigPath

    Write-Host "Writing ssh_config to: $Global:SshConfigPath"

    if (Test-Path $Global:SshExePath) {
        Write-Host "SSH Path = $Global:SshExePath"
        # Make all git ssh calls use this with our config and quiet logging
        $env:GIT_SSH_COMMAND = "`"$Global:SshExePath`" -F `"$Global:SshConfigPath`""
    } else {
        Write-Yellow "WARNING: ssh.exe not found at $Global:SshExePath"
    }
}

function Invoke-ClusterSSH {
    param(
        [Parameter(Mandatory=$true)][string]$Command
    )

    if (-not (Test-Path $Global:SshExePath)) {
        Write-Red "ERROR: ssh.exe not found at $Global:SshExePath"
        return
    }

    # Use quiet logging; host key stuff and banner noise suppressed
    & $Global:SshExePath `
        -F $Global:SshConfigPath `
        "clustergit-pi5-server@10.27.12.244" `
        $Command
}

# Initialize SSH wiring as soon as utilities is loaded
Initialize-PortableSSH

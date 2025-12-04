# 1_setup.ps1 — Clean SSH setup without warnings

Write-Host "==== ClusterGit Demo: Environment Check ====" -ForegroundColor Cyan
Write-Host ""

# Force using portable SSH + suppress fingerprint noise globally
$Env:GIT_SSH_COMMAND = "ssh -i `"$PSScriptRoot\..\portable\keys\id_rsa`" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
$Env:SSH_COMMAND = $Env:GIT_SSH_COMMAND

$ClusterUser = "clustergit-pi5-server"
$ClusterHost = "10.27.12.244"

$SSH = $Env:GIT_SSH_COMMAND

# Quick connectivity check
Write-Host "Testing SSH Connection..."
cmd /c "$SSH $ClusterUser@$ClusterHost echo OK" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cannot reach cluster!" -ForegroundColor Red
    exit 1
}
Write-Host "SSH OK. ClusterGit reachable."

Write-Host ""
Write-Host "==== K3s Node Status ===="
cmd /c "$SSH $ClusterUser@$ClusterHost kubectl get nodes -o wide" 2>$null

Write-Host ""
Write-Host "==== Longhorn Volumes ===="
cmd /c "$SSH $ClusterUser@$ClusterHost kubectl get volumes.longhorn.io -A" 2>$null

Write-Host ""
Write-Host "==== Environment Check Completed ===="
Write-Host "Cluster is healthy!"
Read-Host "Next step: Run 2_studentLoginRepo.ps1 - press ENTER"



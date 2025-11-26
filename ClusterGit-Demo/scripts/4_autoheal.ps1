<#
  autoheal.ps1
  - Shows current cluster state
  - Guides presenter through killing worker4
  - Automatically detects the correct k3s service on worker4
  - Shows cluster healing
#>

# ---------- CONFIG ----------
$ServerUser   = "clustergit-pi5-server"
$ServerHost   = "10.27.12.244"

$WorkerUser   = "clustergit-pi5-worker4"
$WorkerHost   = "10.27.12.233"
# -----------------------------

Write-Host "=== ClusterGit Demo: AUTOHEALING ===" -ForegroundColor Cyan
Write-Host ""

# Step 1 — Show current cluster state
Write-Host "Step 1: Show current cluster state..."
Read-Host "Press ENTER to run 'kubectl get nodes' on the cluster"

ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed – run manually in cluster shell.'"

Write-Host ""
Write-Host "Step 2: Prepare to simulate worker4 failure."
Write-Host "We will now determine the correct k3s service on worker4 automatically."
Write-Host ""

# ---------- AUTO SERVICE DETECTION BLOCK ----------
$serviceCheck = @"
if systemctl status k3s-agent >/dev/null 2>&1; then
    echo 'SERVICE=k3s-agent'
elif systemctl status k3s-node >/dev/null 2>&1; then
    echo 'SERVICE=k3s-node'
elif systemctl status k3s >/dev/null 2>&1; then
    echo 'SERVICE=k3s'
else
    echo 'SERVICE=NONE'
fi
"@

$serviceResult = ssh "$WorkerUser@$WorkerHost" $serviceCheck

if ($serviceResult -match "SERVICE=k3s-agent") {
    $ServiceName = "k3s-agent"
} elseif ($serviceResult -match "SERVICE=k3s-node") {
    $ServiceName = "k3s-node"
} elseif ($serviceResult -match "SERVICE=k3s") {
    $ServiceName = "k3s"
} else {
    Write-Host "ERROR: No k3s-related service found on worker4!" -ForegroundColor Red
    Write-Host "Cannot continue autoheal demo." -ForegroundColor Red
    exit 1
}

Write-Host "Detected worker4 service: $ServiceName" -ForegroundColor Green
Write-Host ""

# --------------------------------------------------

Write-Host "Stopping worker4 service to simulate failure:"
Write-Host "Running: sudo systemctl stop $ServiceName"
Read-Host "Press ENTER to kill worker4"

ssh "$WorkerUser@$WorkerHost" "sudo systemctl stop $ServiceName && echo 'worker4 stopped' || echo 'FAILED to stop $ServiceName (check permissions)'"

Write-Host ""
Write-Host "Step 3: Observe cluster state after failure..."
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed – run manually.'"

Write-Host ""
Write-Host "Explain: 'Kubernetes detects NotReady and the system tolerates the failure.'"
Read-Host "Press ENTER to heal worker4"

Write-Host ""
Write-Host "Starting worker4 service: sudo systemctl start $ServiceName"
ssh "$WorkerUser@$WorkerHost" "sudo systemctl start $ServiceName && echo 'worker4 started' || echo 'FAILED to start $ServiceName'"

Write-Host ""
Write-Host "Final cluster state:"
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed.'"

Write-Host ""
Write-Host "Demo complete: Node failure recovered without data loss."
Write-Host ""


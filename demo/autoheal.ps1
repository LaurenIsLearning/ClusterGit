#autoheal to show importance of autohealing

<#
  autoheal.ps1
  - Demonstrates auto-healing / resiliency.
  - From Windows, we SSH into the server node, inspect volumes/nodes,
    then SSH into worker4, stop k3s-agent, and show how the cluster responds.
  - This version uses kubectl and Longhorn CRDs *if available*.
#>

# ---------- CONFIG ----------
$ServerUser   = "clustergit-pi5-server"
$ServerHost   = "10.27.12.244"

$WorkerUser   = "clustergit-pi5-worker4"   # adjust if user is different
$WorkerHost   = "10.27.12.240"            # CHANGE to worker4 IP

# Whether Longhorn is installed. If $true, we’ll try to show volumes/replicas.
$HasLonghorn  = $true
# -----------------------------

Write-Host "=== ClusterGit Demo: AUTOHEALING ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Show current cluster state (nodes, volumes/replicas if available)..."
Read-Host "Explain this to the audience, then press ENTER to run the commands"

# Show nodes
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide"

if ($HasLonghorn) {
    Write-Host ""
    Write-Host "Attempting to show Longhorn volumes and replicas via kubectl..."
    ssh "$ServerUser@$ServerHost" "kubectl get volumes.longhorn.io || echo 'No Longhorn volumes found (maybe not installed yet).'"
    ssh "$ServerUser@$ServerHost" "kubectl get replicas.longhorn.io -A -o wide || echo 'No Longhorn replicas found.'"
}

Write-Host ""
Write-Host "Step 2: Simulate a node failure by stopping k3s-agent on worker4 ($WorkerHost)..."
Read-Host "Tell the audience you are 'killing' a node; press ENTER to continue"

ssh "$WorkerUser@$WorkerHost" "sudo systemctl stop k3s-agent || echo 'Failed to stop k3s-agent (check permissions)'"

Write-Host ""
Write-Host "Step 3: Observe cluster state after failure..."
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide"

if ($HasLonghorn) {
    Write-Host ""
    ssh "$ServerUser@$ServerHost" "kubectl get replicas.longhorn.io -A -o wide || echo 'Replicas info unavailable.'"
}

Write-Host ""
Write-Host "Explain: 'Kubernetes notices the node is NotReady; Longhorn/K8s reschedule workloads or rebuild replicas.'"
Write-Host ""

Write-Host "Step 4: Bring worker4 back up (autoheal complete)..."
Read-Host "Tell the audience you're restoring the node; press ENTER to continue"

ssh "$WorkerUser@$WorkerHost" "sudo systemctl start k3s-agent || echo 'Failed to start k3s-agent (check permissions)'"

Write-Host ""
Write-Host "Final cluster state:"
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide"

Write-Host ""
Write-Host "You can now summarize: 'Even when a node fails, the system recovers without losing student submissions.'"
Write-Host ""

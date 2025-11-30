<#
  4_autoheal.ps1
  - Show current cluster state
  - Stop k3s-agent on worker4 to simulate failure
  - Show cluster state degraded
  - Start k3s-agent again
  - Show cluster healed
#>

# ---------- CONFIG ----------
$ServerUser   = "clustergit-pi5-server"
$ServerHost   = "10.27.12.244"

$WorkerUser   = "clustergit-pi5-worker4"
$WorkerHost   = "10.27.12.233"   # worker4 IP
$WorkerService = "k3s-agent"
# -----------------------------

Write-Host "=== ClusterGit Demo: AUTOHEALING ===" -ForegroundColor Cyan
Write-Host ""

# Step 1 — Show current cluster state
Write-Host "Step 1: Current cluster state (all nodes should be Ready)."
Read-Host "Explain this to the audience, then press ENTER to run 'kubectl get nodes'"

ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed – run manually in your cluster shell.'"

Write-Host ""
Write-Host "Step 2: Simulate a node failure by stopping k3s-agent on worker4."
Read-Host "Tell the audience you're 'killing' a worker node; press ENTER to stop the service"

$stopOutput = ssh "$WorkerUser@$WorkerHost" "sudo systemctl stop $WorkerService && echo 'worker4 stopped' || echo 'FAILED to stop $WorkerService (check permissions)'"
Write-Host $stopOutput

Write-Host ""
Write-Host "Step 3: Observe cluster state after failure (worker4 should show NotReady)."
Read-Host "Press ENTER to run 'kubectl get nodes' again"

ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed – run manually.'"

Write-Host ""
Write-Host "Explain: 'Kubernetes detects the NotReady node and can reschedule workloads as needed.'"
Write-Host ""
Read-Host "When you're ready to 'heal' the node, press ENTER to start $WorkerService again"

Write-Host "Starting worker4 service again..."
$startOutput = ssh "$WorkerUser@$WorkerHost" "sudo systemctl start $WorkerService && echo 'worker4 started' || echo 'FAILED to start $WorkerService'"
Write-Host $startOutput

Write-Host ""
Write-Host "Final cluster state (worker4 should be Ready again):"
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed.'"

Write-Host ""
Write-Host "You can now summarize: 'Even when a node fails, the system recovers without losing student submissions.'"
Write-Host ""



<#
  autoheal.ps1
  - Show current cluster state
  - Guide the presenter through manually “killing” worker4
  - Show cluster recovering
#>

# ---------- CONFIG ----------
$ServerUser   = "clustergit-pi5-server"
$ServerHost   = "10.27.12.244"

$WorkerUser   = "clustergit-pi5-worker4"
$WorkerHost   = "10.27.12.233"   # adjust if needed
# -----------------------------

Write-Host "=== ClusterGit Demo: AUTOHEALING ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Show current cluster state..."
Read-Host "Tell the audience what they're seeing; press ENTER to run 'kubectl get nodes' on the cluster"

ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed here – run it manually in your cluster shell.'"

Write-Host ""
Write-Host "Step 2: Simulate a node failure (worker4)."
Write-Host "In a separate terminal, run:"
Write-Host "  ssh $WorkerUser@$WorkerHost"
Write-Host "  sudo systemctl stop k3s-agent"
Write-Host ""
Read-Host "After worker4 shows NotReady in kubectl, press ENTER to continue"

Write-Host ""
Write-Host "Step 3: Observe cluster state after failure..."
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed here – run it manually in your cluster shell.'"

Write-Host ""
Write-Host "Explain: 'Kubernetes notices the node is NotReady and reschedules workloads / rebuilds replicas (with Longhorn in the full system).'"
Write-Host ""
Read-Host "When you're ready to 'heal' the node, press ENTER for instructions"

Write-Host "Step 4: Bring worker4 back up."
Write-Host "In that separate terminal, run:"
Write-Host "  sudo systemctl start k3s-agent"
Write-Host ""
Read-Host "Once worker4 is Ready again, press ENTER to show final state"

Write-Host ""
Write-Host "Final cluster state:"
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed here – run it manually in your cluster shell.'"

Write-Host ""
Write-Host "You can now summarize: 'Even when a node fails, the system recovers without losing student submissions.'"
Write-Host ""


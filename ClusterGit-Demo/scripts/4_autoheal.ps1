<#
  4_autoheal.ps1
  - Show current cluster state
  - Give step-by-step instructions to manually “kill” worker4
  - Show cluster state again after recovery
#>

$ServerUser = "clustergit-pi5-server"
$ServerHost = "10.27.12.244"

$WorkerUser = "clustergit-pi5-worker4"
$WorkerHost = "10.27.12.233"

Write-Host "=== ClusterGit Demo: AUTOHEALING ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Show current cluster state..." -ForegroundColor Yellow
Read-Host "Tell the audience what they're seeing; press ENTER to run 'kubectl get nodes' on the cluster"

ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed here – run it manually in your cluster shell.'"

Write-Host ""
Write-Host "Step 2: Simulate a node failure (worker4)." -ForegroundColor Yellow
Write-Host "In a separate terminal, run these commands manually:" -ForegroundColor Cyan
Write-Host "  ssh $WorkerUser@$WorkerHost"
Write-Host "  sudo systemctl stop k3s-agent"
Write-Host ""
Read-Host "After worker4 shows NotReady in 'kubectl get nodes', press ENTER to continue"

Write-Host ""
Write-Host "Step 3: Observe cluster state after failure..." -ForegroundColor Yellow
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed here – run it manually in your cluster shell.'"

Write-Host ""
Write-Host "Explain to the audience:" -ForegroundColor Cyan
Write-Host "  'Kubernetes notices the node is NotReady and reschedules workloads / rebuilds replicas (with Longhorn in the full system).'"
Write-Host ""
Read-Host "When you're ready to 'heal' the node, press ENTER for instructions"

Write-Host ""
Write-Host "Step 4: Bring worker4 back up." -ForegroundColor Yellow
Write-Host "In that worker4 SSH terminal, run:" -ForegroundColor Cyan
Write-Host "  sudo systemctl start k3s-agent"
Write-Host ""
Read-Host "Once worker4 is Ready again in 'kubectl get nodes', press ENTER to show final state"

Write-Host ""
Write-Host "Final cluster state:" -ForegroundColor Yellow
ssh "$ServerUser@$ServerHost" "kubectl get nodes -o wide || echo 'kubectl failed here – run it manually in your cluster shell.'"

Write-Host ""
Write-Host "You can now summarize: 'Even when a node fails, the system recovers without losing student submissions.'" -ForegroundColor Green
Write-Host "==== Demo Complete ===="


Write-Host ""
Write-Host "You can now summarize: 'Even when a node fails, the system recovers without losing student submissions.'"
Write-Host ""



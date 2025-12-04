#MAIN THINGS TO CHANGE ARE RIGHT HERE
$Worker4NodeName       = "pi5-worker4"
$ServerHostAlias       = "clustergit-pi5-server@10.27.12.244" #MAINLY THIS
$DemoDeploymentName    = "autoheal-demo"
$DemoLabel             = "app=autoheal-demo"

function SSH-Server {
    param([string]$cmd)
    ssh $ServerHostAlias $cmd
}

function Kube {
    param([string]$cmd)
    SSH-Server "KUBECONFIG=`$HOME/.kube/config kubectl $cmd"
}

function Section {
    param([string]$msg)
    Write-Host ""
    Write-Host $msg -ForegroundColor Cyan
}

function Prompt {
    param([string]$msg)
    Write-Host ""
    Write-Host $msg -ForegroundColor Yellow
    Read-Host
}

function Result {
    param([string]$msg)
    Write-Host $msg -ForegroundColor Green
}

function Show-Nodes {
    Section "Nodes (worker4 will be drained)"
    Kube "get nodes"
}

function Get-PodsOnWorker4 {
    Kube ("get pods -A --field-selector spec.nodeName={0} -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,NODE:.spec.nodeName --no-headers" -f $Worker4NodeName)
}

function Show-PodsOnWorker4 {
    Section ("Pods on ${Worker4NodeName}")
    $pods = Get-PodsOnWorker4
    if ($pods) {
        $pods | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host ("[None] - no pods currently on {0}." -f $Worker4NodeName)
    }
}

function Get-DemoPodsAllNodes {
    Kube ("get pods -n default -l {0} -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName --no-headers" -f $DemoLabel)
}

function Show-DemoPods {
    param([string]$title)
    Section $title
    $demoPods = Get-DemoPodsAllNodes
    if ($demoPods) {
        $demoPods | ForEach-Object { Result $_ }
    } else {
        Write-Host ("[None] - no pods for label {0}." -f $DemoLabel)
    }
}

function Ensure-DemoWorkloadOnWorker4 {
    Section ("Ensure demo workload '${DemoDeploymentName}' exists")
    $existing = Kube ("get deployment {0} -n default --no-headers 2>/dev/null" -f $DemoDeploymentName)

    if (-not [string]::IsNullOrWhiteSpace($existing)) {
        Result ("Deployment '${DemoDeploymentName}' already exists")
        return $false
    }

    Result ("Creating deployment '${DemoDeploymentName}' (3 replicas)")
    Kube ("create deployment ${DemoDeploymentName} --image=nginx:stable-alpine -n default") | Out-Null
    Kube ("scale deployment ${DemoDeploymentName} -n default --replicas=3") | Out-Null

    Start-Sleep -Seconds 10

    $maxTries = 6
    for ($i = 1; $i -le $maxTries; $i++) {
        $podsOn4 = Kube ("get pods -n default -l ${DemoLabel} --field-selector spec.nodeName=${Worker4NodeName} -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName --no-headers")

        if (-not [string]::IsNullOrWhiteSpace($podsOn4)) {
            Result ("Pod(s) landed on ${Worker4NodeName}:")
            $podsOn4 | ForEach-Object { Write-Host $_ }
            return $true
        }

        Write-Host ("Waiting for scheduling (${i}/${maxTries})...")
        Start-Sleep -Seconds 10
    }

    Write-Host "Scheduler did not place demo pod on worker4"
    return $true
}

$CreatedDemoDeployment = $false

Show-Nodes
Prompt "Press ENTER to ensure a demo app is running on worker4"

$CreatedDemoDeployment = Ensure-DemoWorkloadOnWorker4

Show-PodsOnWorker4
Show-DemoPods "Demo pods BEFORE drain (NAME -> NODE)"

Prompt "Press ENTER to drain worker4 via kubectl"

Section ("Draining ${Worker4NodeName}")
Kube ("drain ${Worker4NodeName} --ignore-daemonsets --delete-emptydir-data --force")

Start-Sleep -Seconds 10

Section ("Pods on ${Worker4NodeName} AFTER drain")
$podsAfter = Get-PodsOnWorker4
if ($podsAfter) {
    $podsAfter | ForEach-Object { Write-Host $_ }
} else {
    Result ("All workloads moved off ${Worker4NodeName}")
}

Show-DemoPods "Demo pods AFTER drain (NAME -> NODE)"

Prompt "Press ENTER to uncordon worker4"

Section ("Uncordoning ${Worker4NodeName}")
Kube ("uncordon ${Worker4NodeName}") | Out-Null
Start-Sleep 5
Show-Nodes

if ($CreatedDemoDeployment) {
    $cleanup = Read-Host "Delete demo deployment '${DemoDeploymentName}' now? (Y/N)"
    if ($cleanup -in @("y","Y","yes","YES")) {
        Section ("Deleting ${DemoDeploymentName}")
        Kube ("delete deployment ${DemoDeploymentName} -n default") | Out-Null
    }
}

Section "Autoheal demo complete"

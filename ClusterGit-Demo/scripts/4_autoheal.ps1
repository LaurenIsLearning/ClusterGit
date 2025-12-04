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
    Section ("Reset demo workload '{0}'" -f $DemoDeploymentName)

    # 1) Delete any existing demo deployment (cleans up old pods too)
    Write-Host ("Deleting any existing deployment '{0}'..." -f $DemoDeploymentName)
    Kube ("delete deployment {0} -n default --ignore-not-found" -f $DemoDeploymentName) | Out-Null

    # 2) Recreate with a known replica count (4) so it can spread across nodes
    Result ("Recreating deployment '{0}' with 4 replicas" -f $DemoDeploymentName)
    Kube ("create deployment {0} --image=nginx:stable-alpine -n default" -f $DemoDeploymentName) | Out-Null
    Kube ("scale deployment {0} -n default --replicas=4" -f $DemoDeploymentName) | Out-Null

    # 3) Wait for at least one demo pod to land on worker4
    Start-Sleep -Seconds 10

    $maxTries = 6
    for ($i = 1; $i -le $maxTries; $i++) {
        $podsOn4 = Kube ("get pods -n default -l {0} --field-selector spec.nodeName={1} -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName --no-headers" -f $DemoLabel, $Worker4NodeName)

        if (-not [string]::IsNullOrWhiteSpace($podsOn4)) {
            Result ("Demo pod(s) on {0}:" -f $Worker4NodeName)
            $podsOn4 | ForEach-Object { Write-Host $_ }
            return $true   # we created it fresh, so it's safe to offer cleanup later
        }

        Write-Host ("Waiting for a demo pod to land on {0} ({1}/{2})..." -f $Worker4NodeName, $i, $maxTries)
        Start-Sleep -Seconds 10
    }

    Write-Host ("Demo deployment created, but scheduler never placed a pod on {0}." -f $Worker4NodeName)
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
$drainCmd    = ("drain {0} --ignore-daemonsets --delete-emptydir-data --force" -f $Worker4NodeName)
$drainOutput = Kube ("{0} 2>&1" -f $drainCmd)  # kept in case you need to debug later
Result ("Drain command completed for {0}" -f $Worker4NodeName)

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
    $cleanup = 'Y'
    if ($cleanup -in @("y","Y","yes","YES")) {
        Section ("Deleting ${DemoDeploymentName}")
        Kube ("delete deployment ${DemoDeploymentName} -n default") | Out-Null
    }
}

Section "Autoheal demo complete"

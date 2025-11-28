# sanity check. (powershell isn't good for opening windows. bat files do that easily)
. "$PSScriptRoot\utilities.ps1"
Write-Section "ClusterGit Demo: Environment Check"

# ssh check
Write-Section "Testing SSH Connection to ClusterGit.." 
$sshTest = Invoke-ClusterSSH "echo Connected" 2>&1
if ($sshTest -match "Connected"){
    Write-Green "SSH OK. ClusterGit reachable."
}else{
    Write-Red "SSH FAILED. Cannot reach ClusterGit."
    Write-Red $sshTest
    exit 1
}

#k3s node health check
Write-Section "K3s Node Status"
Invoke-ClusterSSH "kubectl get nodes -o wide"

#longhorn volume health
Write-Section "Longhorn Volumes"
Invoke-ClusterSSH "kubectl -n longhorn-system get volumes"

# git-annex availability
$annexVersion = Invoke-ClusterSSH "git-annex version | head -n 3" 2>&1
if ($annexVersion -match "git-annex version") {
    Write-Green "Git-annex available:`n$annexVersion"
} else {
    Write-Red "Git-annex NOT found in ClusterGit"
}

#disk usage
Write-Section "Disk Usage (Longhorn)"
Invoke-ClusterSSH "df -h | grep longhorn"

#check done
Write-Section "Environment Check Completed"
Write-Green "Cluster is healthy!"
Write-Yellow "Next step: Student runs 2_studentLoginRepo.ps1"
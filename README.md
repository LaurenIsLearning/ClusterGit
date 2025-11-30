# Cluster State Overview
**Last updated:** `2025-11-28`

This document describes the current state of the **ClusterGit Raspberry Pi K3s cluster**, including node roles, namespaces, storage layout, and Longhorn replica distribution.

---

# System Summary
ClusterGit runs on:

- **K3s Kubernetes**
- **Longhorn** distributed block storage  
  - Replicas: **2**  
  - Only SSD-tagged disks are used
- **Git-Annex** for distributed repo content
- **Postgres** for metadata (namespace: `services`)
- **Prometheus + Grafana** for monitoring (namespace: `monitoring`)

Replication will later be increased to **3** with more SSD-equipped worker nodes.

---

# Node Hardware Layout

| Node | Role | SSD | Primary Data | Notes |
|------|------|-----|--------------|-------|
| **pi5-server** | Control-plane | ✅ Yes | Longhorn replica | Hosts control-plane + Longhorn controllers |
| **pi5-worker1** | Worker | ❌ No | None | System-only workloads |
| **pi5-worker2** | Worker | ✅ Yes | **Repo volume**, **Postgres volume** | Main IO / storage endpoint |
| **pi5-worker3** | Worker | ❌ No | Monitoring workloads | Alertmanager, kube-state-metrics |
| **pi5-worker4** | Worker | ❌ No | Grafana volume | Runs Grafana UI + analytics |

---

# Namespaces

| Namespace | Purpose |
|----------|----------|
| `default` | Empty for now |
| `kube-system` | K3s core components |
| `longhorn-system` | Longhorn controllers + engines |
| `monitoring` | Prometheus, Alertmanager, Grafana |
| `services` | Postgres metadata DB |
| `storage` | Git RWX repo storage |

---

# Active PVCs

| Namespace | PVC Name | Purpose | Size | Mode | StorageClass | Mounted On |
|----------|-----------|---------|------|------|---------------|------------|
| **storage** | repo-vol-pvc | Shared Git repo storage | 200Gi | RWX | longhorn | pi5-worker2 |
| **services** | data-postgres-0 | Postgres metadata | 10Gi | RWO | longhorn | pi5-worker2 |
| **monitoring** | grafana-pvc | Grafana dashboards | 5Gi | RWO | longhorn | pi5-worker4 |

---

# Longhorn Volumes

| Volume ID | PVC Name | Size | Replicas | Status | Attached To |
|-----------|-----------|-------|----------|---------|--------------|
| pvc-f71d51f4 | repo-vol-pvc | 200Gi | 2 | healthy | pi5-worker2 |
| pvc-eb7594f4 | data-postgres-0 | 10Gi | 2 | healthy | pi5-worker2 |
| pvc-2bc58c5a | grafana-pvc | 5Gi | 2 | healthy | pi5-worker4 |

---

# Longhorn Replica Placement  
Replica scheduling is now **SSD-only**, using disk tag `ssd`.

| Volume | Replica 1 | Replica 2 |
|--------|-----------|------------|
| **repo-vol-pvc** | pi5-worker2 (SSD) | pi5-server (SSD) |
| **data-postgres-0** | pi5-worker2 (SSD) | pi5-server (SSD) |
| **grafana-pvc** | pi5-worker4 | pi5-worker2 or pi5-server |

> Grafana intentionally lives on a non-SSD node due to low IO demand.

Disk configuration:
- `/mnt/ssd` on **pi5-server** and **pi5-worker2** tagged with `ssd`
- `/var/lib/longhorn` disabled from scheduling on all nodes

---

# Workload Distribution

### **pi5-server (Control Plane + SSD)**
- K3s control-plane
- Longhorn controllers
- Traefik
- Prometheus
- Longhorn replica (SSD)

### **pi5-worker1**
- Longhorn worker pods only  
- No data workloads

### **pi5-worker2 (Main Storage Node + SSD)**
- **Postgres**
- **Git RWX storage deployment**
- **Repo PVC**
- **Postgres PVC**
- Longhorn engine

### **pi5-worker3**
- Alertmanager
- kube-state-metrics
- Node exporter

### **pi5-worker4**
- **Grafana**
- Grafana PVC
- Node exporter

---

# Auto-Healing (Longhorn)

If a replica is lost:

1. Longhorn marks the volume **degraded**
2. A replacement node is selected (SSD preferred)
3. Replica rebuild starts immediately
4. Workloads remain online  
5. Volume returns to **healthy**

This ensures Postgres + Git operations continue even during node loss.

---

# Expanding Replica Count  
(After adding more SSD nodes)

Increase replicas to 3:

```bash
kubectl -n longhorn-system patch volumes.longhorn.io <VOLUME_NAME> \
  --type merge -p '{"spec":{"numberOfReplicas":3}}'
```

Use for:
- repo-vol-pvc
- data-postgres-0
- grafana-pvc

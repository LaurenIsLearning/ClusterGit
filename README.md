# ClusterGit

A Git + Git-Annex based large file storage system running on a Raspberry Pi 5 K3s cluster.

**Last updated:** March 2026

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Cluster Infrastructure](#cluster-infrastructure)
- [Local Development Setup](#local-development-setup)
- [Working on a Feature Branch](#working-on-a-feature-branch)
- [Workflows Reference](#workflows-reference)
- [Kubernetes Reference](#kubernetes-reference)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Browser (Cloudflare Pages)
    ↓
Cloudflare (CDN + TLS)
    ↓
Traefik (K3s ingress)
    ↓
Backend Pod (Node.js + git-annex)
    ↓
Longhorn PVC (/repos)
    ↓
Git bare repos + git-annex object store
    ↓
Supabase (external) — auth + metadata
```

The backend handles all Git and git-annex operations. File content is stored on a Longhorn PVC at `/repos`. Supabase is external — it stores metadata only (users, repos, annex keys) and is not hosted on the cluster.

---

## Cluster Infrastructure

### Nodes

| Node | Role | SSD | Workloads |
|------|------|-----|-----------|
| pi5-server | Control plane | ✅ | Traefik, Prometheus, Longhorn controllers |
| pi5-worker1 | Worker | ❌ | Longhorn worker only |
| pi5-worker2 | Worker | ✅ | Backend pods, Git PVC |
| pi5-worker3 | Worker | ❌ | Alertmanager, kube-state-metrics |
| pi5-worker4 | Worker | ❌ | Grafana |

### Namespaces

| Namespace | Purpose |
|-----------|---------|
| `storage` | Production backend — serves `main` and `develop` branches |
| `preview-<branch>` | Per-branch isolated environments, auto-created on push and auto-deleted on branch delete |
| `monitoring` | Prometheus, Alertmanager, Grafana |
| `longhorn-system` | Longhorn storage controllers |

### Storage (Longhorn PVCs)

| Namespace | PVC | Size | Purpose |
|-----------|-----|------|---------|
| `storage` | repo-vol-rwo-pvc | 200Gi | Production git repos |
| `preview-<branch>` | repo-vol-`<branch>` | 5Gi | Per-branch repo storage |
| `monitoring` | grafana-pvc | 5Gi | Grafana dashboards |

All repo PVCs are mounted at `/repos` inside the backend pod.

### Environments

| Environment | Frontend URL | Backend URL |
|-------------|-------------|-------------|
| Local dev | http://localhost:5173 | http://localhost:3000 |
| Feature branch | `<branch>.clustergit.pages.dev` | `<branch>.clustergit.com` |
| Production (develop) | clustergit.com | develop.clustergit.com |
| main | not active yet | — |

### Infrastructure files

| File | Purpose |
|------|---------|
| `k8s/preview-template.yaml` | Template for per-branch namespace, PVC, deployment, service, and ingress |
| `k8s/storage-deployment.yaml` | Production deployment in `storage` namespace |
| `k8s/storage-ingress.yaml` | Production ingress for `clustergit.com` and `develop.clustergit.com` |
| `k8s/node-sync-cronjob.yaml` | Scheduled Prometheus → Supabase node health sync in `storage` namespace |
| `scripts/deploy-preview.sh` | Called by the preview deploy workflow to spin up branch environments |

---

## Local Development Setup

> **Note:** `.env` files are for local development only and are gitignored. Preview and production environment variables are managed via GitHub Actions secrets (backend) and Cloudflare Pages environment variables (frontend).

### Backend

```bash
cd backend
npm install
cp .env.example .env
# fill in your Supabase credentials in .env
npm start
```

`.env` should look like:
```env
# Local development only
PORT=3000
REPO_BASE_PATH=./local-repos
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PROMETHEUS_URL=your_prometheus_url
```

Backend runs at http://localhost:3000

To manually refresh node health from Prometheus into Supabase (from backend):
```bash
npm run sync:nodes
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# fill in your Supabase credentials in .env
npm run dev
```

`.env` should look like:
```env
# Local development only
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Frontend runs at http://localhost:5173. The API URL is determined automatically from the hostname — no `VITE_API_URL` needed.

---

## Working on a Feature Branch

### How it works

Creating a branch automatically spins up an isolated preview environment on the cluster. When you push commits, the backend image builds and deploys to that environment. Cloudflare Pages builds the frontend automatically on every push.

The frontend detects the branch from the hostname and routes API calls to `<branch>.clustergit.com`. Each branch is fully isolated — nothing you do affects anyone else.

When your branch is deleted after merging, the entire `preview-<branch>` namespace and PVC are automatically deleted. **Any repo data in that preview environment is permanently gone.**

`main` and `develop` are protected — they skip the preview namespace system and deploy to the `storage` namespace instead.

### Steps

1. Create your branch off `develop` — either on GitHub or locally:
```bash
   git checkout develop && git pull
   git checkout -b your-feature-name
   git push origin your-feature-name
```

2. Push a commit touching `backend/` to trigger the image build:
```bash
   git push origin your-feature-name
```
   > Note: The preview namespace is created on branch creation. The backend image only builds when `backend/` is changed — push any small change (even a comment) to trigger it.

3. Watch progress:
   - **Image build:** GitHub → Actions → `Build Backend Image`
   - **Pod status:** `kubectl get pods -n preview-<your-branch-name> -w`
   
   Wait for `1/1 Running` before testing.

4. Test at `https://your-feature-name.clustergit.pages.dev`

> ⚠️ **"Failed to load projects"?** The pod isn't ready yet — once it shows `1/1 Running` the error resolves on its own, no refresh needed.

5. Open a PR into `develop` when ready.

### Notes

- Preview PVCs are **5Gi** — don't upload large files in preview
- Supabase is shared across all environments — auth and user accounts are the same everywhere, only file storage is isolated
- Branch names are lowercased with slashes converted to hyphens (`feature/my-thing` → `feature-my-thing`)

---

## Workflows Reference

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `backend-base.yml` | Push to `backend/Dockerfile.base` | Rebuilds base Docker image as `clustergit-backend-base:latest` |
| `backend-image.yml` | Push to any branch touching `backend/` | Builds and pushes `clustergit-backend:<branch>` (also `:latest` for main) |
| `preview-deploy.yml` | Branch created or push to any branch | Deploys preview environment (skips main/develop) |
| `preview-cleanup.yml` | Branch deleted | Deletes `preview-<branch>` namespace and PVC |
| `deploy-production.yml` | Push to `main` or `develop` | Restarts `storage` deployment to pick up new image |

---

## Kubernetes Reference

### Useful commands

```bash
# See all active preview environments
kubectl get namespaces | grep preview

# Check pod status for a branch
kubectl get pods -n preview-<branch>

# Stream logs for a branch
kubectl logs -n preview-<branch> <pod-name> -f

# Check all PVCs
kubectl get pvc -A

# Check all ingresses
kubectl get ingress -A

# Exec into a pod
kubectl exec -n preview-<branch> <pod-name> -- ls /repos

# Force restart a deployment
kubectl rollout restart deployment clustergit-backend -n preview-<branch>
kubectl rollout restart deployment clustergit-backend -n storage
```

### Checking repo file storage

```bash
# List repos for a user (user ID from Supabase)
kubectl exec -n preview-<branch> <pod-name> -- ls /repos/<user-id>/

# Verify file content was stored by git-annex
kubectl exec -n preview-<branch> <pod-name> -- find /repos/<user-id>/<repo-name>.git/annex/objects -type f
```

### Rebuilding infrastructure manually

```bash
kubectl apply -f k8s/storage-ingress.yaml
kubectl apply -f k8s/storage-deployment.yaml
```

Preview environments are recreated by pushing the branch again.

---

## Troubleshooting

### Preview environment not appearing after push

1. Check `Preview Deploy` action completed in GitHub Actions
2. `kubectl get pods -n preview-<branch>` — is the pod running?
3. `kubectl get ingress -n preview-<branch>` — does the ingress exist?
4. Pod in `ErrImagePull` means `Build Backend Image` hasn't finished or failed

### 500 on repo create or file upload

1. `kubectl get pods -n preview-<branch>` — get the pod name
2. `kubectl logs -n preview-<branch> <pod-name> -f` — stream logs and reproduce
3. Common causes:
   - `git-annex UUID could not be determined` — git-annex init failed
   - `PVC not bound` — check `kubectl get pvc -n preview-<branch>`
   - `Author identity unknown` — git identity not set on bare repo

### Requests hitting the wrong pod

```bash
kubectl get ingress -A
```
Each hostname should appear exactly once. If duplicated, Traefik load-balances randomly — delete the duplicate ingress.

### Pod not picking up new code

```bash
kubectl rollout restart deployment clustergit-backend -n preview-<branch>
kubectl rollout status deployment clustergit-backend -n preview-<branch>
```

### Production not updating after merge

```bash
kubectl rollout restart deployment clustergit-backend -n storage
kubectl rollout status deployment clustergit-backend -n storage
```

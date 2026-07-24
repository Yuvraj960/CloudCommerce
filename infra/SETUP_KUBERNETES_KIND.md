# Kubernetes (Kind) Setup Guide for CloudCommerce

This guide walks you through setting up the entire CloudCommerce platform on a **fresh Windows PC** from a GitHub clone.

---

## Overview

The project runs 7 microservices + 5 infrastructure components inside a **Kind** (Kubernetes in Docker) cluster on your local machine. No cloud account needed.

```
Kind Cluster (your PC)
├── NGINX Ingress Controller
├── auth-service (JWT auth)
├── product-service (MongoDB)
├── cart-service (Redis)
├── order-service (PostgreSQL)
├── payment-service (PostgreSQL, Kafka consumer)
├── notification-service (Kafka consumer)
├── frontend (React + Vite)
└── Infrastructure
    ├── postgres (PostgreSQL 16)
    ├── mongo (MongoDB 7)
    ├── redis (Redis 7)
    ├── kafka (KRaft mode, no Zookeeper)
    └── localstack (S3/SQS/SNS emulation)
```

---

## Phase 1 — Install Prerequisites

### 1.1 Docker Desktop

Download from [docker.com](https://www.docker.com/products/docker-desktop/).

During setup:
- Enable **WSL 2** backend (recommended on Windows)
- Ensure Docker starts and shows "Engine running" in system tray

Verify:
```powershell
docker --version
docker compose version
```

### 1.2 Kind

Kind runs a full Kubernetes cluster inside Docker — no VM needed.

```powershell
# Download kind.exe (Windows)
curl -Lo kind.exe https://github.com/kubernetes-sigs/kind/releases/download/v0.20.0/kind-windows-amd64

# Move to a folder in your PATH, e.g.:
Move-Item kind.exe $env:LOCALAPPDATA\kind\kind.exe

# Verify
$env:PATH = "$env:LOCALAPPDATA\kind;$env:PATH"
kind version
```

> **Note:** On Windows, save the kubeconfig to a custom path since you may have `KUBECONFIG` pointing elsewhere. All `kubectl` commands below use `--kubeconfig $env:LOCALAPPDATA\kind\kubeconfig`.

### 1.3 kubectl

The Kubernetes CLI.

```powershell
curl -Lo kubectl.exe https://dl.k8s.io/release/v1.27.0/bin/windows/amd64/kubectl.exe
Move-Item kubectl.exe $env:LOCALAPPDATA\kind\kubectl.exe
```

Verify:
```powershell
$env:PATH = "$env:LOCALAPPDATA\kind;$env:PATH"
kubectl version --client
```

### 1.4 Node.js (for building the project)

Download from [nodejs.org](https://nodejs.org/) — use the LTS version.

Verify:
```powershell
node --version
npm --version
```

---

## Phase 2 — Clone and Explore the Repo

```powershell
git clone https://github.com/YOUR_USERNAME/cloudcommerce.git
cd cloudcommerce
```

Key files you'll work with:

| File | Purpose |
|------|---------|
| `infra/k8s/base/namespaces.yaml` | Creates 8 namespaces |
| `infra/k8s/base/infra.yaml` | PostgreSQL, MongoDB, Redis, Kafka, LocalStack |
| `infra/k8s/base/ingress.yaml` | NGINX Ingress routing |
| `infra/k8s/base/hpa.yaml` | Horizontal Pod Autoscalers |
| `infra/k8s/services/*.yaml` | One manifest per service (Deployment + Service + Secret) |
| `infra/docker-compose.yml` | **OR** run everything in plain Docker instead (no K8s needed) |

---

## Phase 3 — Create the Kind Cluster

### 3.1 Create the cluster

```powershell
cd cloudcommerce
kind create cluster --name cloudcommerce --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig
```

This creates a single-node Kubernetes v1.27.3 cluster inside Docker.

### 3.2 Label the node for NGINX Ingress

```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig label node cloudcommerce-control-plane node-role.kubernetes.io/control-plane=true ingress-ready=true --overwrite
```

### 3.3 Verify the cluster

```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig get nodes
```

Expected output:
```
NAME                           STATUS   ROLES           AGE
cloudcommerce-control-plane   Ready    control-plane   2m
```

---

## Phase 4 — Build All Service Images

You need to build Docker images for all 7 services and load them into Kind. Kind doesn't pull from Docker Hub — it uses images stored in its own node's Docker daemon.

> **Why this step?** Kind pods use `imagePullPolicy: Never` — they look for images in the Kind node's local Docker daemon, not a remote registry. Every time you `docker build`, the image goes into your local Docker daemon. You must `kind load docker-image` to copy it into Kind's internal daemon.

Run all builds from the repo root:

```powershell
cd cloudcommerce

# Build all 7 services in parallel (this takes ~3-5 minutes)
docker build -f services/auth-service/Dockerfile -t auth-service:local . &
docker build -f services/product-service/Dockerfile -t product-service:local . &
docker build -f services/cart-service/Dockerfile -t cart-service:local . &
docker build -f services/order-service/Dockerfile -t order-service:local . &
docker build -f services/payment-service/Dockerfile -t payment-service:local . &
docker build -f services/notification-service/Dockerfile -t notification-service:local . &
docker build -f services/frontend/Dockerfile -t frontend:local . &
wait

# Or sequentially (slower but easier to debug if one fails):
docker build -f services/auth-service/Dockerfile -t auth-service:local .
```

### 4.2 Load images into Kind

After each build, load it into Kind:

```powershell
kind load docker-image --name cloudcommerce auth-service:local
kind load docker-image --name cloudcommerce product-service:local
kind load docker-image --name cloudcommerce cart-service:local
kind load docker-image --name cloudcommerce order-service:local
kind load docker-image --name cloudcommerce payment-service:local
kind load docker-image --name cloudcommerce notification-service:local
kind load docker-image --name cloudcommerce frontend:local
```

> **Tip:** Images that were already rebuilt (e.g. after a code change) must be re-loaded — otherwise Kind keeps running the old cached image.

Verify images are loaded:
```powershell
docker exec cloudcommerce-control-plane crictl images
```

---

## Phase 5 — Deploy the Infrastructure

### 5.1 Namespaces, Secrets, and Infra (order matters!)

```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/base/namespaces.yaml
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/base/secrets.yaml
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/base/infra.yaml
```

### 5.2 Wait for infrastructure to be ready

```powershell
# Check status
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig get pods -n infra

# Expected (after 1-2 minutes, Kafka takes longest ~60-90 seconds):
NAME                      READY   STATUS
postgres-xxxx             1/1     Running
mongo-xxxx                1/1     Running
redis-xxxx                1/1     Running
localstack-xxxx           1/1     Running
kafka-0                   1/1     Running    ← Takes 60-90 seconds!
```

Kafka (KRaft mode) can take 60-90 seconds to start. Other infra pods should be Running within 30 seconds.

If Kafka shows `CrashLoopBackOff` — check logs:
```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig logs -n infra kafka-0
```

**Common Kafka issues:**
- `Cluster ID string auto does not appear to be a valid UUID` → The `CLUSTER_ID` env var in `infra.yaml` is invalid. It must be a valid 22-char base64 UUID. The repo has this pre-configured correctly.
- `ECONNREFUSED` on port 29092 → `KAFKA_BROKER` in service configs uses wrong port (should be `:29092`, not `:9092`). Pre-configured in this repo.

### 5.3 (Alternative) Create LocalStack resources with Terraform

Instead of manual `curl` commands to create S3 buckets, use Terraform to codify all LocalStack resources:

```powershell
cd infra/terraform/localstack
terraform init
terraform apply -var="localstack_endpoint=http://localhost:4566"
```

This creates:
- **S3 bucket** `cloudcommerce-images` (product image uploads)
- **SNS topic** `cloudcommerce-orders` (event notifications)
- **SQS queue** `cloudcommerce-order-queue` (async order processing)

### 5.4 Create LocalStack S3 bucket (manual alternative)

If not using Terraform:

```powershell
curl -X PUT "http://localhost:4564/_localstack_bucket"   # if accessing via port-forward
# OR from within the cluster (after product-service is running):
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig exec -n product deploy/product-service -- curl -X PUT "http://localstack:4566/cloudcommerce-bucket"
```

---

## Phase 6 — Deploy the Services

```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/services/
```

This deploys all 7 services. Check status:

```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig get pods -A
```

Expected output:
```
NAME                         READY   STATUS
auth-xxxx                    1/1     Running
product-xxxx                 1/1     Running
cart-xxxx                    1/1     Running
order-xxxx                   1/1     Running
payment-xxxx                 1/1     Running
notification-xxxx            1/1     Running
frontend-xxxx                1/1     Running
postgres-xxxx                1/1     Running
mongo-xxxx                   1/1     Running
redis-xxxx                   1/1     Running
localstack-xxxx              1/1     Running
kafka-0                      1/1     Running
ingress-nginx-controller-xxx 1/1    Running
```

All should show `Running 1/1`. Services may restart once or twice during Kafka connection (normal — Kafka isn't ready when services start, they reconnect automatically).

---

## Phase 7 — Deploy NGINX Ingress Controller

The NGINX Ingress controller is installed as a DaemonSet with hostPort:

```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/base/ingress.yaml
```

This creates the `cloudcommerce-ingress` with rules for all 7 services.

Verify the ingress is created:
```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig get ingress -A
```

---

## Phase 8 — Access the Services

### Option A — Via Ingress (recommended, routes all 7 services)

Add to your Windows hosts file (`C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1 auth.cloudcommerce.local
127.0.0.1 products.cloudcommerce.local
127.0.0.1 cart.cloudcommerce.local
127.0.0.1 orders.cloudcommerce.local
127.0.0.1 payments.cloudcommerce.local
127.0.0.1 notifications.cloudcommerce.local
127.0.0.1 app.cloudcommerce.local
```

Find the Ingress controller port:
```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig get svc -n ingress-nginx
```

Look for `ingress-nginx-controller` — it listens on a NodePort (e.g. `32726`).

Access services:
```
http://auth.cloudcommerce.local:32726/health
http://products.cloudcommerce.local:32726/health
http://cart.cloudcommerce.local:32726/health
http://orders.cloudcommerce.local:32726/health
http://payments.cloudcommerce.local:32726/health
http://notifications.cloudcommerce.local:32726/health
http://app.cloudcommerce.local:32726/
```

### Option B — Direct NodePort (no hosts file needed)

Frontend is also exposed on NodePort `30080`:
```
http://localhost:30080/
```

Individual services have ClusterIP only — use `kubectl port-forward` for direct access:
```powershell
# Forward auth-service to localhost:3001
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig port-forward -n auth svc/auth 3001:3001
```

### Option C — Docker Compose (alternative, no Kubernetes needed)

If Kubernetes setup is too complex, run everything in plain Docker:

```powershell
docker compose -f infra/docker-compose.yml up -d
```

This starts all services and infrastructure in Docker only (no Kind). Access at `localhost:3001` through `localhost:3007`.

---

## Phase 9 — (Optional) Deploy metrics-server for HPA

HPA (Horizontal Pod Autoscaler) shows `<unknown>` for CPU metrics until metrics-server is deployed.

```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Patch to allow insecure TLS (Kind uses self-signed certs)
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig patch deployment metrics-server -n kube-system --type=json -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

---

## Daily Development Workflow

### After a fresh clone
```powershell
cd cloudcommerce
kind create cluster --name cloudcommerce --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig
kubectl label node cloudcommerce-control-plane ingress-ready=true --overwrite

# Build, load, and deploy
docker build -f services/auth-service/Dockerfile -t auth-service:local .
kind load docker-image --name cloudcommerce auth-service:local
# ... (repeat for all services, then deploy)
kubectl apply -f infra/k8s/base/
kubectl apply -f infra/k8s/services/
kubectl apply -f infra/k8s/base/ingress.yaml
```

### After code changes
```powershell
cd cloudcommerce

# 1. Build the changed service
docker build -f services/auth-service/Dockerfile -t auth-service:local .

# 2. Load it into Kind
kind load docker-image --name cloudcommerce auth-service:local

# 3. Rolling restart of the deployment (pods restart with new image)
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig rollout restart deployment auth -n auth

# 4. Watch the rollout
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig rollout status deployment auth -n auth
```

### View logs
```powershell
# All pods in a namespace
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig logs -n auth -l app=auth --tail=50 -f

# One specific pod
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig logs -n kafka kafka-0 --tail=100 -f
```

---

## Troubleshooting

### Kafka not starting / CrashLoopBackOff
```powershell
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig logs -n infra kafka-0 | tail -50
```
- `Cluster ID string auto does not appear to be a valid UUID` → The cluster was created without proper CLUSTER_ID. Ensure `infra/k8s/base/infra.yaml` has `CLUSTER_ID: "PsUQhyizSbmLweamXxvmqw=="` (valid base64 UUID).
- Kafka KRaft takes 60-90s to start. If probes are enabled and killing it, probes are removed in this repo.

### Services can't connect to Kafka
Services must use `kafka.infra.svc.cluster.local:29092` (not port 9092). Port 9092 is the Kubernetes Service port — Kafka listens on 29092 inside the container.

### MongoDB probe timeout
Changed to `tcpSocket:27017` in `infra/k8s/base/infra.yaml`. The `mongosh --eval` exec probe timed out because mongosh takes too long to start.

### Kind cluster breaks after Docker Desktop restarts
Docker Desktop restart resets the Kind node. Get fresh kubeconfig and re-load images:
```powershell
kind get kubeconfig --name cloudcommerce > $env:LOCALAPPDATA\kind\kubeconfig

# Re-load all images (Docker Desktop restart clears them)
kind load docker-image --name cloudcommerce auth-service:local
kind load docker-image --name cloudcommerce product-service:local
# ... repeat for all services
```

### `kubectl` can't connect to cluster
```powershell
# Check if kind cluster exists
kind get clusters

# Recreate if missing
kind create cluster --name cloudcommerce --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig

# Verify connection
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig version
```

### ImagePullBackOff
Pods can't find the image. Kind uses `imagePullPolicy: Never` so it must find images in the node's local Docker daemon. Re-load:
```powershell
kind load docker-image --name cloudcommerce <image>:local
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig rollout restart deployment <service> -n <namespace>
```

---

## Phase 10 — Infrastructure as Code with Terraform

As an alternative to pure `kubectl apply`, this project can manage infrastructure using **Terraform**:

### Terraform manages two workspaces:

| Workspace | Resources | Provider |
|-----------|-----------|----------|
| `infra/terraform/localstack/` | S3 bucket, SNS topic, SQS queue | AWS (LocalStack) |
| `infra/terraform/kubernetes/` | Namespaces, Secrets, ConfigMaps | Kubernetes |

### Install Terraform (once)

```powershell
# Download and install Terraform 1.7.5 to %LOCALAPPDATA%\terraform
$tfVersion = "1.7.5"
Invoke-WebRequest -Uri "https://releases.hashicorp.com/terraform/$tfVersion/terraform_${tfVersion}_windows_amd64.zip" -OutFile "$env:TEMP\terraform.zip"
Expand-Archive -Path "$env:TEMP\terraform.zip" -DestinationPath "$env:LOCALAPPDATA\terraform" -Force
$env:PATH = "$env:LOCALAPPDATA\terraform;$env:PATH"
terraform version
```

### Manage LocalStack resources

```powershell
cd infra/terraform/localstack
terraform init
terraform apply -var="localstack_endpoint=http://localhost:4566"
```

**What this creates:**
- `cloudcommerce-images` S3 bucket
- `cloudcommerce-orders` SNS topic
- `cloudcommerce-order-queue` SQS queue
- SNS → SQS subscription (queue receives events published to the SNS topic)

### Manage Kubernetes resources

After the Kind cluster is running, Terraform can manage cluster-level resources:

```powershell
cd infra/terraform/kubernetes
terraform init
terraform apply -var="kubeconfig_path=$env:LOCALAPPDATA\kind\kubeconfig"
```

**What this creates:**
- All 8 namespaces (auth, product, cart, order, payment, notification, frontend, infra)
- One Kubernetes Secret per service namespace (JWT_SECRET, DATABASE_URL, MONGODB_URI, etc.)
- `global` ConfigMap in the `default` namespace (Kafka broker, Redis URL, LocalStack endpoint)

**What this does NOT create** (still managed by kubectl/YAML):
- Infra Deployments/StatefulSets (postgres, mongo, redis, kafka, localstack) — managed via `infra/k8s/base/infra.yaml`
- Service Deployments and Services — managed via `infra/k8s/services/*.yaml`

### Using Makefile targets

The `infra/terraform/Makefile` has convenience targets:

```powershell
# LocalStack resources
make tf-localstack-apply     # init + apply
make tf-localstack-plan      # dry-run
make tf-localstack-destroy   # tear down

# Kubernetes namespace + secrets
make tf-k8s-apply            # init + apply (requires cluster)
make tf-k8s-plan             # dry-run
make tf-k8s-destroy          # remove all managed resources

# Both at once
make tf-all-apply
make tf-all-destroy
```

### Terraform vs kubectl — what to use when

| Resource | Terraform | kubectl / YAML |
|----------|-----------|----------------|
| S3/SNS/SQS queue | ✅ Preferred | Manual curl |
| Kubernetes Namespaces | ✅ Preferred | Also via YAML |
| Kubernetes Secrets | ✅ Preferred (env vars via vars) | Also in YAML |
| Kubernetes ConfigMaps | ✅ Preferred | Also in YAML |
| Infra Deployments (postgres, etc.) | ❌ Not managed | YAML only |
| Service Deployments | ❌ Not managed (complex spec) | YAML only |

> **Why not Terraform for everything?** Terraform's Kubernetes provider doesn't handle complex container specs (sidecars, initContainers, resource limits, probes) as cleanly as raw YAML. The project's approach: Terraform for declarative infrastructure metadata (names, secrets, config), YAML for runtime workloads (Deployments). This makes the YAML files the runbook and Terraform the bootstrap.

> **Note on Terraform state**: Local state only (`terraform.tfstate` files stored in `infra/terraform/*/`). No remote backend. State files contain sensitive secrets (base64-encoded). They stay on your machine only — `.gitignore` in the terraform directory excludes them.

---

## Teardown

To destroy the entire Kind cluster:
```powershell
kind delete cluster --name cloudcommerce
```

Secrets, Docker images, and the repo itself remain on disk.

---

## Quick Reference — All Commands in Order

```powershell
# 1. Prerequisites
#Install: Docker Desktop, kind.exe, kubectl.exe, Node.js

# 2. Clone
git clone <repo-url>
cd cloudcommerce

# 3. Create cluster
kind create cluster --name cloudcommerce --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig label node cloudcommerce-control-plane ingress-ready=true --overwrite

# 4. Build and load images (one at a time or in parallel)
docker build -f services/auth-service/Dockerfile -t auth-service:local .
kind load docker-image --name cloudcommerce auth-service:local
# ... repeat for all 7 services

# 5. Deploy
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/base/namespaces.yaml
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/base/secrets.yaml
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/base/infra.yaml
# Wait ~90s for Kafka
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/services/
kubectl --kubeconfig $env:LOCALAPPDATA\kind\kubeconfig apply -f infra/k8s/base/ingress.yaml

# 6. Access
# Add hosts entries, then visit http://app.cloudcommerce.local:<INGRESS_PORT>/
```
# Kind Cluster Deployment

> Full Kubernetes deployment on your local machine using Kind (Kubernetes in Docker).

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Kind installed → `kind.exe` at `C:\Users\lenovo\AppData\Local\kind\kind.exe`
- kubectl installed (comes with Docker Desktop or can be installed separately)

---

## ⚠️ Critical: kubectl Context Isolation

On this Windows machine, **two Kubernetes clusters exist** and kubectl can only talk to one at a time:

| Context | Current default? | Kubeconfig | Use case |
|---------|----------------|-----------|---------|
| `docker-desktop` | **Yes** (default) | `~/.kube/config` (Docker Desktop's) | Docker Desktop's built-in K8s |
| `kind-cloudcommerce` | No | `$HOME/AppData/Local/kind/kubeconfig` | Kind cluster |

**All Kind operations must use explicit `KUBECONFIG`:**
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl get pods -n infra
```

If you see `CrashLoopBackOff` on old workloads when expecting new ones — you're probably hitting `docker-desktop` by accident. Verify:
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl get nodes   # should show "cloudcommerce-control-plane"
kubectl get nodes                                          # likely shows "docker-desktop"
```

---

## Kind Cluster Anatomy

```
kind cluster "cloudcommerce"
├── cloudcommerce-control-plane  (Docker container = K8s node)
│   ├── All pods run here (infra + services)
│   └── Runs on Docker network "kind"
└── Storage: Docker volumes (PVCs → host Docker volumes)
```

### Kind kubeconfig location
```
C:\Users\lenovo\AppData\Local\kind\kubeconfig
```
Export for bash sessions:
```bash
# Bash (Git Bash / WSL)
export KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig"

# PowerShell
$env:KUBECONFIG = "$HOME\AppData\Local\kind\kubeconfig"
```

---

## Create / Delete the Kind Cluster

### Create cluster
```bash
"C:\Users\lenovo\AppData\Local\kind\kind.exe" create cluster --name cloudcommerce \
  --kubeconfig="$HOME\AppData\Local\kind\kubeconfig"
```

### Delete cluster
```bash
"C:\Users\lenovo\AppData\Local\kind\kind.exe" delete cluster --name cloudcommerce
```

### Check cluster status
```bash
"C:\Users\lenovo\AppData\Local\kind\kind.exe" get clusters
"C:\Users\lenovo\AppData\Local\kind\kind.exe" get nodes --name cloudcommerce
```

---

## Deploy the Full System to Kind

### Step 1 — Apply base (infra: Kafka, Postgres, MongoDB, Redis, LocalStack + Ingress + namespaces)

```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/base/namespaces.yaml
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/base/configmaps.yaml
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/base/secrets.yaml
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/base/infra.yaml
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/base/ingress.yaml
```

Wait for infra pods:
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl wait -n infra --for=condition=ready pod -l app=postgres --timeout=120s
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl wait -n infra --for=condition=ready pod -l app=mongo --timeout=120s
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl wait -n infra --for=condition=ready pod -l app=redis --timeout=60s
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl wait -n infra --for=condition=ready pod -l app=localstack --timeout=120s
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl wait -n infra --for=condition=ready pod -l app=kafka --timeout=180s
```

### Step 2 — Apply services

```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/services/
```

Wait for services:
```bash
for NS in auth product cart order payment notification frontend; do
  KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl wait -n $NS --for=condition=ready pod --timeout=180s
done
```

### Step 3 — Verify

```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl get pods --all-namespaces

# Services should all be 1/1 Running
# Kafka ready: 1/1
# All others: 1/1 or 2/2 Running
```

---

## Load Images Into Kind {#load-image}

**Every time you build a Docker image**, you must load it into Kind or pods will show `ErrImageNeverPull`.

```bash
# Load a single service
"C:\Users\lenovo\AppData\Local\kind\kind.exe" load docker-image --name cloudcommerce auth-service:local

# Load ALL services (from repo root)
for svc in auth-service product-service cart-service order-service payment-service notification-service frontend; do
  "C:\Users\lenovo\AppData\Local\kind\kind.exe" load docker-image --name cloudcommerce $svc:local
done
```

The `kind` binary path for PowerShell:
```powershell
& "C:\Users\lenovo\AppData\Local\kind\kind.exe" load docker-image --name cloudcommerce auth-service:local
```

For the Bash tool (Git Bash):
```bash
"/c/Users/lenovo/AppData/Local/kind/kind.exe" load docker-image --name cloudcommerce auth-service:local
```

After loading, **restart the pods** to pick up the new image:
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl delete pod -n auth -l app=auth-service --grace-period=0
```

---

## Rebuild and Redeploy a Service (Full Cycle)

```bash
# 1. Build the Docker image
docker build -f services/auth-service/Dockerfile -t auth-service:local .

# 2. Load into Kind
"C:\Users\lenovo\AppData\Local\kind\kind.exe" load docker-image --name cloudcommerce auth-service:local

# 3. Restart pods (to pick up new image)
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl delete pod -n auth -l app=auth-service

# 4. Verify
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl get pods -n auth

# 5. Check logs
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl logs -n auth -l app=auth-service --tail=10
```

---

## Kafka in Kind (KRaft Mode)

**File:** `infra/k8s/base/kafka-kraft-direct.yaml` (active), [`infra/k8s/base/infra.yaml`](../../infra/k8s/base/infra.yaml) (has old ZK-mode Kafka, not used)

Kafka runs in **KRaft mode** (no ZooKeeper) with these critical settings:

| Setting | Value | Why |
|---------|-------|-----|
| `KAFKA_LISTENERS` | `PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:29093` | 9092=clients, 29093=controller quorum |
| `KAFKA_ADVERTISED_LISTENERS` | `PLAINTEXT://kafka.infra.svc.cluster.local:9092` | What clients use to connect |
| `KAFKA_CONTROLLER_LISTENER_NAMES` | `CONTROLLER` | Names the controller listener |
| `KAFKA_CONTROLLER_QUORUM_VOTERS` | `1@localhost:29093` | Single-node: broker IS controller, no DNS needed |
| `KAFKA_PROCESS_ROLES` | `broker,controller` | Combined Kafka + controller in one JVM |

Services connect via: `kafka.infra.svc.cluster.local:9092` (client port)

See [Kafka deep-dive →](../architecture/kafka.md) for full KRaft configuration explanation.

---

## DNS and Ingress

Add to `C:\Windows\System32\drivers\etc\hosts` (run Notepad as Administrator):
```
127.0.0.1  auth.cloudcommerce.local
127.0.0.1  products.cloudcommerce.local
127.0.0.1  cart.cloudcommerce.local
127.0.0.1  orders.cloudcommerce.local
127.0.0.1  payments.cloudcommerce.local
127.0.0.1  notifications.cloudcommerce.local
127.0.0.1  app.cloudcommerce.local
```

Then access services at `http://auth.cloudcommerce.local:3001`, etc.

---

## Makefile Targets

The [`infra/Makefile`](../../infra/Makefile) has useful targets:
```bash
make tf-k8s           # Terraform: create namespaces + secrets in Kind
make apply-base       # Apply infra base to Kind (namespaces, infra, ingress)
make wait-services    # Wait for all service pods to be ready
make port-forward-frontend  # Port-forward frontend to localhost:5173
```

---

## Useful Debug Commands

```bash
# Get all pods
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl get pods --all-namespaces

# Get pod events (why is it Pending/CrashLoopBackOff?)
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl describe pod kafka-0 -n infra

# Follow pod logs
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl logs -f -n infra kafka-0

# Check Kafka broker version
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl exec -n infra kafka-0 -- kafka-broker-api-versions --bootstrap-server localhost:9092

# Test Kafka connectivity from a service pod
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl exec -n order order-service-xxx -- nc -z kafka.infra.svc.cluster.local 9092

# Delete everything and start fresh
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl delete -f infra/k8s/base/ --ignore-not-found
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl delete -f infra/k8s/services/ --ignore-not-found
```

---

## Quick Reference Checklist (Fresh Kind Deploy)

```
□ Delete old Kafka STS (if exists, to reset KRaft state): kubectl delete sts kafka -n infra
□ Apply infra manifests in order: namespaces → configmaps → secrets → infra.yaml → ingress.yaml
□ Wait for infra pods: postgres, mongo, redis, localstack, kafka (1/1 Running)
□ Load all Docker images into Kind (kind load docker-image --name cloudcommerce <svc>:local)
□ Apply service manifests (kubectl apply -f infra/k8s/services/)
□ Wait for all services (kubectl wait -n <ns> --for=condition=ready pod --timeout=180s)
□ Verify: kubectl get pods --all-namespaces (all 1/1 or 2/2 Running)
□ Check Kafka: kubectl logs -n infra kafka-0 | grep "Kafka Server started"
□ Check service Kafka connectivity: kubectl logs -n order order-service-xxx | grep "Kafka connected"
```

---

## Troubleshooting

If something goes wrong, see: [Troubleshooting →](troubleshooting.md)

Common issues:
- [Kafka CrashLoopBackOff →](troubleshooting.md#kafka-crashloop)
- [ErrImageNeverPull →](troubleshooting.md#errimageneverpull)
- [kubectl hitting wrong cluster →](troubleshooting.md#wrong-kubeconfig)
# Troubleshooting

> Every known problem with CloudCommerce and how to fix it. Organized by symptom.

---

## How to Use This Guide

1. Find the symptom that matches what you're seeing
2. Read the **Diagnosis** section to confirm the cause
3. Apply the **Fix** in order
4. Re-verify the fix worked

If a problem isn't listed here, it may be in:
- [Kafka KRaft issues →](../architecture/kafka.md)
- [Kind cluster issues →](kind.md)
- [Development Logs →](../../Development%20Logs%20and%20Decisions.md)

---

## Quick Diagnostic Reference

| Symptom | Likely cause | Quick fix |
|---------|------------|----------|
| `ErrImageNeverPull` on all pods | Images not loaded into Kind | `kind load docker-image --name cloudcommerce <svc>:local` |
| `ErrImageNeverPull` on some pods | kubectl hitting wrong cluster (docker-desktop) | Use `KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig"` |
| Kafka `CrashLoopBackOff` | KRaft `controller.quorum.voters` uses wrong port/host | Fix to `1@localhost:29093`; wipe `/var/lib/kafka/data` |
| Kafka `CrashLoopBackOff` with `IllegalArgumentException` | `controller.listener.names` mismatch | Set `KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER` + dual-listener |
| Service can't reach Kafka | Service uses port 9092 vs 29092 | Use `kafka.infra.svc.cluster.local:9092` (client port) |
| MongoDB `CrashLoopBackOff` | Container restart loop | Check `mongod` command; probe timing |
| Pods `Pending` | PVC not bound | `kubectl get pvc -A` — check if PVC exists and is Bound |
| All infra pods `CrashLoopBackOff` | kubectl hitting `docker-desktop` not Kind | Verify with `KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl get nodes` |
| Deploy doesn't trigger | No self-hosted runner registered | Use `workflow_dispatch` or register a self-hosted runner |

---

## kubectl Hitting Wrong Cluster {#wrong-kubeconfig}

### Symptom
```bash
# No Kind pods shown, or seeing different pods than expected
kubectl get pods -n infra
# Shows: pods from docker-desktop, or empty infra namespace
```

### Diagnosis

Two Kubernetes clusters on this machine:

```bash
# Docker Desktop cluster (default for PowerShell kubectl)
kubectl config get-contexts
# CURRENT   NAME            CLUSTER
# *         docker-desktop  docker-desktop

# Kind cluster (cloudcommerce)
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl config get-contexts
# CURRENT   NAME             CLUSTER
# *         kind-cloudcommerce kind-cloudcommerce
```

### Fix

Always use explicit `KUBECONFIG` for Kind operations:

```bash
# For Bash/Git Bash
export KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig"

# For PowerShell
$env:KUBECONFIG = "$env:USERPROFILE\AppData\Local\kind\kubeconfig"

# Then verify you're on the right cluster
kubectl get nodes   # should show "cloudcommerce-control-plane"
```

**On this machine, `kubectl` without `KUBECONFIG` always hits `docker-desktop`.**

---

## ErrImageNeverPull {#errimageneverpull}

### Symptom
```
Error: ErrImageNeverPull
```
Pods can't pull the Docker image from the local Kind node's image cache.

### Cause
After building a Docker image locally, Kind's Docker-in-Docker setup doesn't automatically know about it. Images must be **explicitly loaded** with `kind load docker-image`.

### Fix

```bash
# Load ALL services at once
for svc in auth-service product-service cart-service order-service payment-service notification-service frontend; do
  "/c/Users/lenovo/AppData/Local/kind/kind.exe" load docker-image --name cloudcommerce $svc:local
done
```

Then delete and recreate the affected pods:
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl delete pod -n auth -l app=auth-service --grace-period=0
```

### Prevention
After any `docker build`, always run the `kind load docker-image` command for that service before applying manifests.

---

## Kafka CrashLoopBackOff {#kafka-crashloop}

### Symptom
```
kafka-0  0/1  CrashLoopBackOff
```
Kafka pod starts then immediately exits with Java exception.

### Diagnosis

Check pod logs:
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl logs -n infra kafka-0 --previous
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl describe pod -n infra kafka-0
```

Match the error from the sections below:

---

### Error: `controller.listener.names must contain at least one value appearing in the 'listeners' configuration`

**Cause:** `KAFKA_CONTROLLER_LISTENER_NAMES` was set to `CONTROLLER` by the entrypoint's default, but `KAFKA_LISTENERS` only had `PLAINTEXT://0.0.0.0:9092` — the `CONTROLLER` security name wasn't in `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP`.

**Fix in** `kafka-kraft-direct.yaml`:
```yaml
env:
  KAFKA_CONTROLLER_LISTENER_NAMES: PLAINTEXT  # WRONG - causes another error!
  # CORRECT: keep CONTROLLER as name, add dual-listener:
command: ["bash", "-c", "
  export KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:29093
  export KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
  export KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER
  ...
"]
```
See [Kafka KRaft fix →](../architecture/kafka.md) for the complete working configuration.

---

### Error: `The advertised.listeners config must not contain KRaft controller listeners`

**Cause:** Tried to use `PLAINTEXT://0.0.0.0:9092` as both the client listener AND controller listener (same port).

**Fix:** Use a **dual-listener** setup:
- `PLAINTEXT://0.0.0.0:9092` → clients/broker traffic
- `CONTROLLER://0.0.0.0:29093` → controller quorum traffic

Set `KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER`, `KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka.infra.svc.cluster.local:9092`.

---

### Error: `controller.quorum.voters must contain a parseable set of voters`

**Cause:** `KAFKA_CONTROLLER_QUORUM_VOTERS` was unset or invalid.

**Fix:** Set in bash command:
```bash
export KAFKA_CONTROLLER_QUUM_VOTERS=1@localhost:29093
```
Must use port **29093** (controller listener), not 9092.

---

### Error: `localhost:29093` resolves but broker can't connect to controller quorum

**Cause:** In a **single-node KRaft** cluster, the broker IS the controller. `controller.quorum.voters=1@localhost:29093` is correct — the broker talks to itself directly without network.

**Diagnosis:** Check if pods can resolve `kafka-0.infra.svc.cluster.local`:
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl exec -n infra kafka-0 -- nc -z kafka-0.infra.svc.cluster.local 29093
# Fails: UnknownHostException — pod FQDN is not resolvable from within the pod
```
Pod FQDNs are NOT resolvable from within the pod by Kubernetes DNS. Use `localhost` for single-node self-communication.

---

### Error: Stale Kafka data directory causing `__cluster_metadata` corruption

**Cause:** Old Kafka data from a previous cluster ID or configuration persists in the PVC.

**Fix:** Wipe the Kafka data directory before recreating:
```bash
# Create a wipe pod
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: kafka-wipe
  namespace: infra
spec:
  restartPolicy: Never
  containers:
    - name: wipe
      image: alpine:3
      command: ["sh", "-c", "rm -rf /data/* && echo WIPED && sleep 5"]
      volumeMounts:
        - name: kafka-storage
          mountPath: /data
  volumes:
    - name: kafka-storage
      persistentVolumeClaim:
        claimName: kafka-pvc
EOF

kubectl logs -n infra kafka-wipe  # should say "WIPED"
kubectl delete pod kafka-wipe -n infra
```

---

## ZooKeeper CrashLoopBackOff (docker-compose / ZK mode)

### Symptom
```
zookeeper  0/1  CrashLoopBackOff
```

### Cause
The `cp-zookeeper:7.6.0` probe uses `nc` (netcat) which isn't immediately available at startup, and `pg_isready`-style exec probes fail.

**Fix:** Changed probes from `exec` to `tcpSocket` in `infra.yaml`:
```yaml
readinessProbe:
  tcpSocket:
    port: 2181
  initialDelaySeconds: 30
  periodSeconds: 15
livenessProbe:
  tcpSocket:
    port: 2181
  initialDelaySeconds: 45
  periodSeconds: 15
```

---

## MongoDB CrashLoopBackOff

### Symptom
```
mongo-xxx  0/1  CrashLoopBackOff
```

### Cause
Most commonly: probe timing, incorrect `mongod` command, or data directory permission issues.

### Fix
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl describe pod -n infra mongo-xxx
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl logs -n infra mongo-xxx --previous
```

Check for `permission denied` or `db path does not exist` errors.

Longer `initialDelaySeconds` (try 60s+) for both probes.

---

## Pods Pending (No PVC)

### Symptom
```
kafka-0  0/1  Pending
```

### Cause
No `PersistentVolumeClaim` exists for the pod's `persistentVolumeClaim` reference. Kafka uses `kafka-pvc`.

### Fix
Create the PVC explicitly:
```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: kafka-pvc
  namespace: infra
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
EOF
```

Verify: `kubectl get pvc -n infra` → should show `kafka-pvc  Bound`

---

## Service Can't Connect to Kafka

### Symptom
```
[WARN] [Runner] The group is rebalancing, re-joining (not a real error, normal startup)
[ERROR] Connection to node kafka.infra.svc.cluster.local:9092 refused
```

### Checklist (both Docker Compose and Kind)

| Check | Docker Compose | Kind |
|-------|---------------|------|
| Kafka port in env var | `KAFKA_BROKER=kafka:9092` | `KAFKA_BROKER=kafka.infra.svc.cluster.local:9092` |
| `imagePullPolicy` | (not relevant) | Must be `Always` after `kind load docker-image` |
| Kafka actually running | `docker compose logs kafka` | `kubectl get pods -n infra kafka-0` → 1/1 |
| Kafka listening | `docker exec kafka nc -z localhost 9092` | `kubectl exec -n infra kafka-0 -- nc -z localhost 9092` |

### Kind: Using the Wrong Port

**The #1 Kind Kafka mistake:** using port **29093** (controller port) for client connections.

Services must use **port 9092** (client/broker port):
```
kafka.infra.svc.cluster.local:9092     ✓ CORRECT
kafka.infra.svc.cluster.local:29093    ✗ WRONG — controller port, not for clients
```

---

## infra.yaml Applying STale Config to Kind

### Symptom
Kafka STS shows old ZK-mode config in Kind even after `kubectl apply -f infra/k8s/base/kafka-kraft-direct.yaml`.

### Cause
Two manifests deploy Kafka to the Kind cluster — `infra.yaml` (ZK mode) and `kafka-kraft-direct.yaml` (KRaft). If `infra.yaml` is applied after `kafka-kraft-direct.yaml`, it overwrites the STS.

### Fix
Only apply one Kafka manifest at a time:
```bash
# Apply ONLY kafka-kraft-direct.yaml, not infra.yaml
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/base/kafka-kraft-direct.yaml
```

Remove ZooKeeper and old Kafka from `infra.yaml` (or use Kustomize overlays to separate ZK-mode from KRaft-mode).

---

## Kafka Consumer Not Receiving Events

### Symptom
Order is placed, `order_created` event is published, but payment-service doesn't process it.

### Diagnostic steps
```bash
# 1. Check Kafka connectivity
kubectl logs -n payment payment-service-xxx --tail=20 | grep "Kafka connected"

# 2. Check consumer group is registered
kubectl exec -n infra kafka-0 -- \
  kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group payment-service-group

# 3. Check topics exist
kubectl exec -n infra kafka-0 -- \
  kafka-topics --bootstrap-server localhost:9092 --list

# 4. Check __consumer_offsets
# Shows LAG; if LAG > 0, consumer isn't processing
```

**Kafka topics auto-create** on first publish. If `order_created` topic doesn't exist yet, publish an order first.

---

## S3 Upload Fails (Product Service)

### Symptom
```
Error: NoSuchBucket: The specified bucket does not exist
```

### Cause
LocalStack doesn't auto-create S3 buckets. The bucket must be created before first use.

### Fix
```bash
curl -X PUT "http://localhost:4566/cloudcommerce-images"
```

Check in Docker Compose: the `localstack` container has an init script that creates this on first startup. On Kind, you may need to run this manually after LocalStack restarts:
```bash
kubectl exec -n infra localstack-xxx -- curl -X PUT "http://localhost:4566/cloudcommerce-images"
```

---

## Terraform Apply Fails

### Symptom
```
Error: context deadline exceeded
```
Or:
```
Error: dial tcp 127.0.0.1:59106: connect: connection refused
```

### Cause
Kind cluster not running or terraform can't reach it because `kubeconfig_path` points to the wrong location.

### Fix
```bash
# Verify Kind is running
kind get clusters

# Verify kubeconfig path
cat $HOME/.kind/kubeconfig | grep "server:"
# Should show: https://127.0.0.1:<port>

# Fix kubeconfig path variable
kind get kubeconfig --name cloudcommerce > $HOME/.kind/kubeconfig
```

Terraform Kubernetes provider reads from `kubeconfig_path` variable in `infra/terraform/kubernetes/variables.tf`. Make sure it points to the Kind kubeconfig:
```
kubeconfig_path = "C:\\Users\\lenovo\\.kind\\kubeconfig"   # Windows
# or
kubeconfig_path = "~/.kind/kubeconfig"                      # Linux/macOS
```

---

## Common Startup Sequence (From Scratch)

```
□ Docker Desktop running ✓
□ Kind cluster exists: kind get clusters
□ Build all service images: docker build -f services/*/Dockerfile -t <svc>:local .
□ Load images into Kind: kind load docker-image --name cloudcommerce <svc>:local
□ Apply infra (in order): namespaces → configmaps → secrets → infra.yaml → ingress
□ Wait for infra: kubectl wait -n infra --for=condition=ready pod --timeout=180s
□ Apply services: kubectl apply -f infra/k8s/services/
□ Wait for services: kubectl wait -n <ns> --for=condition=ready pod --timeout=180s
□ Verify: kubectl get pods --all-namespaces | grep Running
□ Final smoke test: curl localhost:3001/health
```

---

## Related Docs

- [Kind setup →](kind.md)
- [Docker Compose →](docker-compose.md)
- [Kafka KRaft →](../architecture/kafka.md)
- [CI/CD →](ci-cd.md)
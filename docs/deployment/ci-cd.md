# CI/CD Pipeline — GitHub Actions

> Automated build, test, and deploy pipeline for CloudCommerce.

---

## Overview

Three workflow files in `.github/workflows/`:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| [`ci.yml`](../../.github/workflows/ci.yml) | Every push/PR | `npm run lint` + TypeScript type-check + `npm run test` |
| [`docker.yml`](../../.github/workflows/docker.yml) | Push to `main` | Build 7 service images → push to **GHCR** (`ghcr.io/<owner>/cloudcommerce/<service>`) |
| [`deploy.yml`](../../.github/workflows/deploy.yml) | Push to `main` | Deploy to Kind cluster (self-hosted runner only) |

---

## Pipeline Flow

```
push to main
    │
    ├─► ci.yml ──────────────────────────────► Lint → TypeCheck → Test
    │                                                          │
    └─► docker.yml ──────────────────────────────────────────► Build 7 images ──► Push to GHCR
                                                                    │
                                                                    ▼
                                                         deploy.yml (auto-deploy)
                                                         (only if self-hosted runner
                                                          is registered)
```

CI always runs. Docker build only runs on push to `main`. Deploy only runs if a self-hosted runner is connected.

---

## CI Pipeline (ci.yml)

### Jobs

**lint** — Runs ESLint on all workspaces that have a `lint` script:
```bash
npm ci
npm run lint --workspaces --if-present
```

**typecheck** — TypeScript type-check on each service (no emit, just check):
```bash
npx tsc --noEmit --project services/auth-service/tsconfig.json
npx tsc --noEmit --project services/product-service/tsconfig.json
# ...etc for all 6 services + frontend
```

**test** — Jest unit tests across all workspaces:
```bash
npm ci
npm run test --workspaces --if-present
```

### Secrets
None required for CI (no external connections).

---

## Docker Build Pipeline (docker.yml)

Triggered on push to `main` AND via `workflow_dispatch` (manual trigger).

### Matrix Build

7 service images built in parallel via matrix strategy:

```yaml
matrix:
  include:
    - service: auth-service;         dockerfile: services/auth-service/Dockerfile
    - service: product-service;       dockerfile: services/product-service/Dockerfile
    - service: cart-service;          dockerfile: services/cart-service/Dockerfile
    - service: order-service;         dockerfile: services/order-service/Dockerfile
    - service: payment-service;       dockerfile: services/payment-service/Dockerfile
    - service: notification-service; dockerfile: services/notification-service/Dockerfile
    - service: frontend;              dockerfile: frontend/Dockerfile
```

### Image Tags Pushed to GHCR

For a commit SHA `abc1234...`:
```
ghcr.io/<owner>/cloudcommerce/auth-service:sha-abc1234       ← SHA tag (for deploys)
ghcr.io/<owner>/cloudcommerce/auth-service:main              ← branch tag
ghcr.io/<owner>/cloudcommerce/auth-service:latest            ← latest
```

The SHA tag is what `deploy.yml` uses for reproducible deploys.

### Required Secrets

| Secret | Provided by | Purpose |
|--------|------------|---------|
| `GITHUB_TOKEN` | **Auto-provided** | Authenticate to GHCR |

No manual secrets needed — `GITHUB_TOKEN` is built into every GitHub Actions run.

### GHCR Visibility

**GHCR packages are private by default.** To make images publicly pullable (needed for Kind cluster nodes to pull without a secret):
- **Option A**: Make the GitHub repo **public** → packages inherit public visibility
- **Option B**: Create a fine-grained PAT with `packages: read` permission and add it as a repo secret → use as `imagePullSecret` in service K8s manifests

For local Kind clusters (where you control the nodes), Option B is cleaner. See [Enabling GHCR pull for Kind →](#ghr-for-kind).

---

## Deploy Pipeline (deploy.yml)

### Architecture

GitHub cloud-hosted runners **cannot reach a local Kind cluster** (it sits behind a home router/desktop). The deploy pipeline solves this with a **self-hosted runner guard**:

```
check-kind job:
  runs: kubectl version --client
  if: kubectl found → kind_reachable = "true"
  if: kubectl not found (cloud runner) → kind_reachable = "false"
       └─► instructions job: shows manual deploy commands
```

**Auto-deploy only works when a self-hosted runner is registered for the repo.**

### Jobs

| Job | Runs when | What it does |
|-----|-----------|-------------|
| `check-kind` | always | Detect if kubectl is available (self-hosted runner) |
| `compute-tag` | always | Compute image tag (SHA or manual input) |
| `prepare-manifests` | always | `sed` stamp `image:` in service YAMLs → GHCR URLs |
| `deploy` | `kind_reachable == true` (self-hosted runner) | Pull images → kind load → kubectl apply |
| `instructions` | `kind_reachable == false` (cloud runner) | Show manual deploy commands |

### Self-Hosted Runner Setup

#### 1. Register a runner (one-time)

Go to: **GitHub repo → Settings → Actions → Runners → New self-hosted runner**

Choose the runner OS matching your dev machine (Linux recommended for Kind compatibility).

#### 2. Download and configure

```bash
mkdir ~/actions-runner && cd ~/actions-runner

# Download (check the download URL from the runner setup page)
curl -L https://github.com/actions/runner/releases/download/v2.319.1/actions-runner-linux-x64-2.319.1.tar.gz | tarxzf -

# Configure (copied from Settings → Actions → Runners)
./config.sh --url https://github.com/<owner>/<repo> --token <RUNNER_TOKEN>

# Authenticate Docker to GHCR (so Kind nodes can pull images)
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
```

#### 3. Point runner's kubectl at Kind

The runner needs a kubeconfig for the Kind cluster. Either:
- Copy Kind kubeconfig to the runner machine: `C:\Users\lenovo\AppData\Local\kind\kubeconfig`
- Set `KUBECONFIG` env var before running the runner

Add to runner startup or `.bashrc`:
```bash
export KUBECONFIG="$HOME/.kind/kubeconfig"  # point to Kind kubeconfig
```

On Windows runner, use:
```powershell
$env:KUBECONFIG = "$env:USERPROFILE\AppData\Local\kind\kubeconfig"
```

#### 4. Start the runner

```bash
./run.sh
```

The runner is now active. On push to `main`, `deploy.yml` will:
1. Pull all GHCR images
2. `kind load docker-image` for each service
3. `kubectl apply -f infra/k8s/base/` + `infra/k8s/services/`
4. Wait for all pods + verify Kafka connectivity

---

## Manual Deploy (No Runner)

Use the **workflow_dispatch** trigger in GitHub Actions UI:

1. Go to **GitHub repo → Actions → Deploy to Kind → Run workflow**
2. Enter the image tag (e.g. `sha-abc1234`) or leave blank for latest SHA
3. The runner uses the `instructions` job to print the exact commands to run locally

Manual deploy command (run on your machine after images are pushed):
```bash
# 1. Get Kind kubeconfig
kind get kubeconfig --name cloudcommerce > ~/.kind/kubeconfig

# 2. Configure kubectl for Kind
export KUBECONFIG=~/.kind/kubeconfig

# 3. Pull deployed images (example SHA)
TAG="sha-abc1234"
for SVC in auth-service product-service cart-service order-service payment-service notification-service frontend; do
  docker pull ghcr.io/<owner>/cloudcommerce/${SVC}:${TAG}
  kind load docker-image ghcr.io/<owner>/cloudcommerce/${SVC}:${TAG} --name cloudcommerce
done

# 4. Apply manifests
kubectl apply -f infra/k8s/base/
kubectl apply -f infra/k8s/services/

# 5. Wait and verify
kubectl get pods --all-namespaces | grep Running
```

---

## Enabling GHCR Pull for Kind Nodes {#ghr-for-kind}

Kind nodes are Docker containers, not pods — they pull images via Docker. The node needs to be logged into GHCR:

On the machine running Kind:
```bash
# Login to GHCR (use a GitHub PAT with read:packages scope)
echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
```

Or via GitHub Actions token (on self-hosted runner):
```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
```

After login, Kind nodes can `docker pull ghcr.io/<owner>/cloudcommerce/<service>:tag` without needing an `imagePullSecret` in Kubernetes manifests.

---

## Image Tags in K8s Manifests

The [`deploy.yml`](../../.github/workflows/deploy.yml) `prepare-manifests` job uses `sed` to stamp image references before deploy:

```bash
# Before stamping
image: auth-service:local
imagePullPolicy: Never

# After stamping  (image: ghcr.io/<owner>/cloudcommerce/auth-service:sha-abc1234)
imagePullPolicy: Always
```

This avoids committing image tags to the repo — the source YAML files always use `:local` tags, and only the deployed versions use GHCR SHA tags.

---

## Verifying the Pipeline

1. **Push a test commit** to a develop branch → `ci.yml` runs (lint + typecheck + test)
2. **Push to main** → `ci.yml` + `docker.yml` run (CI passes, images push to GHCR)
3. **Register self-hosted runner** → push to main triggers `deploy.yml` auto-deploy
4. **Manual trigger** → use workflow_dispatch in GitHub Actions UI

---

## Workflow Badge

Add to your `README.md`:

```markdown
[![CI](https://github.com/<owner>/cloudcommerce/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/cloudcommerce/actions/workflows/ci.yml)
[![Docker](https://github.com/<owner>/cloudcommerce/actions/workflows/docker.yml/badge.svg)](https://github.com/<owner>/cloudcommerce/actions/workflows/docker.yml)
[![Deploy](https://github.com/<owner>/cloudcommerce/actions/workflows/deploy.yml/badge.svg)](https://github.com/<owner>/cloudcommerce/actions/workflows/deploy.yml)
```

---

## Service Dockerfiles Reference

All services use **multi-stage builds** from repo root (for npm workspace support):

```
services/auth-service/Dockerfile         ← context: . (repo root)
services/product-service/Dockerfile
services/cart-service/Dockerfile
services/order-service/Dockerfile
services/payment-service/Dockerfile
services/notification-service/Dockerfile
frontend/Dockerfile                      ← context: . (repo root)
```

Key Docker pattern: the build stage must `npm run build --workspace=packages/common` before building services — because services import from `@cloudcommerce/common`.

---

## Related Docs

- [Quick local run with Docker Compose →](docker-compose.md)
- [Kind cluster setup →](kind.md)
- [All troubleshooting →](troubleshooting.md)
- [Architecture / Kafka events →](../architecture/kafka.md)
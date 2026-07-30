# CloudCommerce

A production-grade microservices e-commerce platform built as a learning project. Implements auth, product catalog, cart, orders, payments, and notifications — all connected through a Kafka event bus.

```
User → Auth → Browse Products → Add to Cart → Create Order
                                          ↓
                               Kafka (order_created)
                                          ↓
                      Payment Service → payment_success / payment_failed
                                          ↓
                    Order Service → order_completed / order_cancelled
                                          ↓
                               Notification Service → email logs
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20, TypeScript |
| API | Express (backend), React + Tailwind + Vite (frontend) |
| Databases | PostgreSQL 16, MongoDB 7, Redis 7 |
| Message Bus | Apache Kafka (ZooKeeper mode in Docker, KRaft in Kind) |
| Cloud Emulation | LocalStack (S3, SNS, SQS) |
| IaC | Terraform |
| Containers | Docker Compose (local), Kubernetes/Kind (deployed) |
| CI/CD | GitHub Actions |
| Observability | Prometheus, Grafana, Loki, Promtail |
| Auth | JWT (access + refresh tokens, bcrypt) |

---

## Prerequisites

- [Docker](https://docs.docker.com/desktop/install/windows-install/) (with Docker Compose)
- [Node.js 20+](https://nodejs.org/) — used for local dev and building
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/) — for Kubernetes deployment

> **Windows note:** All `docker compose` commands use the legacy `docker-compose` syntax in this README. If using Docker Desktop v24+, `docker compose` (no hyphen) also works. PowerShell is the default shell on Windows — commands shown use Unix-style for brevity, but all paths and URLs are the same.

---

## Quick Start (Docker Compose — Full App)

This runs the entire platform: infrastructure + all 7 services.

```bash
# 1. Clone the repo and enter it
git clone <repo-url>
cd cloudcommerce

# 2. Start everything (infrastructure + all services)
docker compose -f infra/docker-compose.yml up -d

# 3. Wait for services to be healthy (~30 seconds)
docker compose -f infra/docker-compose.yml ps

# 4. Verify all health endpoints respond
curl http://localhost:3001/health   # auth-service
curl http://localhost:3002/health   # product-service
curl http://localhost:3003/health   # cart-service
curl http://localhost:3004/health   # order-service
curl http://localhost:3005/health  # payment-service
curl http://localhost:3006/health   # notification-service
curl http://localhost:5173          # frontend (returns HTML)

# 5. Open the app in your browser
start http://localhost:5173
```

> **First time?** Docker will pull base images (~2 GB) and build all service images from source. Subsequent starts are instant.

---

## Full E-Commerce Flow (via CLI)

All services must be running before starting these steps.

### 1. Register and Login

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Secret123!","name":"Alice"}'

# Login (save the accessToken from the response)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Secret123!"}'

# Refresh the access token
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<your-refresh-token>"}'
```

### 2. Browse Products

```bash
curl http://localhost:3002/api/products                    # list all
curl "http://localhost:3002/api/products?search=mouse"    # search
curl "http://localhost:3002/api/products?category=Electronics" # filter
curl http://localhost:3002/api/products/<product-id>       # single product
```

### 3. Manage Cart (requires auth)

```bash
TOKEN="<access-token>"

# Add item
curl -X POST http://localhost:3003/api/cart/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":"<product-id>","quantity":2}'

# View cart
curl http://localhost:3003/api/cart -H "Authorization: Bearer $TOKEN"

# Update quantity
curl -X PATCH http://localhost:3003/api/cart/items/<product-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":5}'

# Remove item
curl -X DELETE http://localhost:3003/api/cart/items/<product-id> \
  -H "Authorization: Bearer $TOKEN"

# Clear cart
curl -X POST http://localhost:3003/api/cart/clear \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Create Order

```bash
TOKEN="<access-token>"

curl -X POST http://localhost:3004/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"productId": "<product-id>", "quantity": 1, "price": 2499}],
    "shippingAddress": {
      "line1": "123 Main Street",
      "city": "New York",
      "state": "NY",
      "postalCode": "10001",
      "country": "US"
    }
  }'

# Check order status (wait 3-5 seconds for payment processing)
curl http://localhost:3004/api/orders -H "Authorization: Bearer $TOKEN"

# View specific order
curl http://localhost:3004/api/orders/<order-id> -H "Authorization: Bearer $TOKEN"
```

**Payment behavior:**
- Orders under **$1,000** → payment succeeds → order becomes `completed`
- Orders **$1,000+** → payment fails (simulated risk scoring) → order becomes `cancelled`

---

## Running Services in Dev Mode (hot reload)

Useful for debugging a single service without rebuilding Docker images.

```bash
# Install dependencies once
npm install

# Run a single service with TypeScript file-watching
npm run dev --workspace=services/auth-service
npm run dev --workspace=services/product-service
npm run dev --workspace=services/cart-service
npm run dev --workspace=services/order-service
npm run dev --workspace=services/payment-service
npm run dev --workspace=services/notification-service

# Run frontend with Vite HMR
npm run dev --workspace=frontend

# Run unit tests for a service
npm test --workspace=services/auth-service
npm test --workspace=services/order-service

# Type-check a service (no emit)
npx tsc --noEmit --project services/auth-service/tsconfig.json
```

> **Note:** When running services in dev mode, infrastructure (PostgreSQL, Kafka, etc.) must still be running via `docker compose -f infra/docker-compose.yml up -d postgres mongo redis kafka localstack`.

---

## Project Layout

```
cloudcommerce/
├── package.json              # npm workspaces root
├── services/
│   ├── auth-service/         # JWT auth, PostgreSQL user store
│   ├── product-service/      # MongoDB catalog + LocalStack S3 images
│   ├── cart-service/         # Redis-backed per-user cart
│   ├── order-service/        # PostgreSQL orders + Kafka producer/consumer
│   ├── payment-service/      # Kafka consumer, simulated payments
│   └── notification-service/ # Kafka consumer, simulated email logs
├── packages/
│   └── common/               # Shared: logger, errors, types, Kafka client, metrics
├── frontend/                 # React + Tailwind + Vite
├── infra/
│   ├── docker-compose.yml   # Full local stack (infra + all services)
│   ├── Makefile              # Kind kubectl targets
│   ├── k8s/                  # Kubernetes manifests for Kind deployment
│   │   ├── base/             # Namespaces, infra, secrets, services
│   │   └── services/         # Per-service K8s deployments
│   └── terraform/            # LocalStack + K8s Terraform workspaces
├── .github/workflows/
│   ├── ci.yml               # Lint + typecheck + unit tests (on push/PR)
│   ├── docker.yml            # Build + push images to GHCR (on push to main)
│   └── deploy.yml            # Deploy to Kind cluster (on push to main)
├── API_CONTRACTS.md          # Source of truth for all API endpoints & events
├── ROADMAP.md                # Build phases
└── Development Logs and Decisions.md  # Design decisions & troubleshooting
```

---

## Service Architecture

| Service | Port | Database | Kafka Role | Notes |
|---------|------|----------|-----------|-------|
| auth-service | 3001 | PostgreSQL | None | JWT access + refresh tokens, bcrypt hashing |
| product-service | 3002 | MongoDB | None | Text search, S3 image upload via LocalStack |
| cart-service | 3003 | Redis | None | HINCRBY for atomic quantity updates, 7-day TTL |
| order-service | 3004 | PostgreSQL | Producer + Consumer | `order_completed`/`order_cancelled` published after payment |
| payment-service | 3005 | PostgreSQL | Consumer | Risk scoring: orders ≥ $1,000 fail |
| notification-service | 3006 | None | Consumer | Logs all 5 Kafka events as simulated emails |
| frontend | 5173 | — | — | Vite React SPA, JWT-gated cart/checkout |

### Database Credentials (docker-compose)
All services use the same PostgreSQL/MongoDB/Redis instances:

| Service | Host | Port | User | Password | Database |
|---------|------|------|------|----------|----------|
| PostgreSQL | localhost | 5432 | cloudcommerce | cloudcommerce | cloudcommerce |
| MongoDB | localhost | 27017 | (none) | (none) | cloudcommerce |
| Redis | localhost | 6379 | (none) | (none) | (none) |
| Kafka | localhost | 9092 | — | — | — |
| LocalStack | localhost | 4566 | test | test | (S3 bucket: cloudcommerce-images) |

---

## Kafka Event Flow

```
order_created
  ├── Payment Service  → payment_success / payment_failed
  │                        ├── Order Service  → order_completed / order_cancelled
  │                        └── Notification Service → [email log]
  └── Notification Service → [email log: order confirmed]
```

| Event | Topic | Published By | Consumed By |
|-------|-------|-------------|-------------|
| Order created | `order_created` | order-service | payment-service, notification-service |
| Order completed | `order_completed` | order-service | notification-service |
| Order cancelled | `order_cancelled` | order-service | notification-service |
| Payment succeeded | `payment_success` | payment-service | order-service, notification-service |
| Payment failed | `payment_failed` | payment-service | order-service, notification-service |

Consumer groups:
- `payment-service-group` — consumes `order_created`
- `order-service-group` — consumes `payment_success`, `payment_failed`
- `notification-service-group` — consumes all 5 events

---

## Kubernetes Deployment (Kind)

Requires a Kind cluster named `cloudcommerce`.

```bash
# Create Kind cluster
kind create cluster --name cloudcommerce

# Build and load all service images into Kind
make kind-load-all

# Apply all Kubernetes manifests
make apply-base
make apply-all

# Wait for all services to be ready
make wait-services

# Verify
kubectl get pods -A

# Port-forward the frontend
make port-forward-frontend  # → http://localhost:5173
```

### Terraform (Optional — LocalStack + K8s metadata)

```bash
# Terraform for LocalStack (S3 bucket, SNS, SQS — auto-created on docker compose up)
make tf-localstack-init
make tf-localstack-apply

# Terraform for K8s manifests (namespaces, secrets, ConfigMaps — NOT deployments)
make tf-k8s-init
make tf-k8s-apply

# Tear down
make tf-localstack-destroy
make tf-k8s-destroy
```

---

## Observability (Phase 12)

Prometheus + Grafana + Loki + Promtail are deployed via `make apply-monitoring`.

```bash
# Deploy the full monitoring stack
make apply-monitoring

# Port forwards
make port-forward-prometheus   # → http://localhost:9090
make port-forward-grafana     # → http://localhost:3000  (admin / prom-operator)
make port-forward-loki        # → http://localhost:3100 (Loki API)
```

All 6 backend services expose `/metrics` (Prometheus format):

```bash
curl http://localhost:3001/metrics  # auth-service
curl http://localhost:3002/metrics  # product-service
curl http://localhost:3003/metrics  # cart-service
curl http://localhost:3004/metrics  # order-service
curl http://localhost:3005/metrics  # payment-service
curl http://localhost:3006/metrics  # notification-service
```

**Pre-provisioned Grafana dashboards:**
- **Platform Overview** — all services at a glance (request rate, error rate, latency)
- **Service Detail** — per-service metrics (request rate, error breakdown, P50/P95/P99 latency, memory)
- **Kafka Consumer Lag** — consumer group lag for all 3 Kafka consumers
- **Cluster Overview** — pod status, CPU/memory usage

**Prometheus alerting rules (5 groups):**
1. `ServiceDown` — any service pod down for >1 min
2. `HighErrorRate` — HTTP error rate >5% for >2 min
3. `KafkaConsumerGroupLag` — consumer lag >100 messages for >5 min
4. `ServiceLatencyP99` — P99 latency >2s for >3 min
5. `DatabaseConnectionFailure` — health check returning 503 for >2 min

**Loki + Promtail** aggregates logs from all service containers. Access via Grafana Explore → Loki with label filters: `{app=~".*-service"}`.

---

## CI/CD (GitHub Actions)

All workflows are in `.github/workflows/`:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | Push/PR | Lint → TypeScript → Unit tests |
| `docker.yml` | Push to `main` | Build all 7 images → push to GHCR |
| `deploy.yml` | Push to `main` | Deploy to Kind cluster (requires self-hosted runner) |

The self-hosted runner must be registered as a GitHub Actions runner in the repo. See CLAUDE.md §"GitHub Actions CI/CD (Phase 11)" for setup instructions.

For manual Kind deployment without a runner:
```bash
# Build
docker build -f services/auth-service/Dockerfile -t auth-service:local .

# Load into Kind
kind load docker-image --name cloudcommerce auth-service:local

# Apply
kubectl apply -f infra/k8s/services/auth-service.yaml
```

---

## Building Docker Images (Manually)

```bash
# Build all services
docker compose -f infra/docker-compose.yml build

# Or build one service at a time
docker build -f services/auth-service/Dockerfile -t cloudcommerce/auth-service:local .

# Rebuild after code changes
docker compose -f infra/docker-compose.yml up -d --build <service-name>
```

---

## API Contracts

All endpoints, request bodies, and response formats are documented in **[API_CONTRACTS.md](API_CONTRACTS.md)**. This is the source of truth — treat it as your spec, not the generated code.

### Response Format

All API responses follow this envelope:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": { ... } } }
```

### Authenticated Requests

All endpoints marked "requires auth" use:
```
Authorization: Bearer <access-token>
```

The access token expires in **15 minutes**. Use the `/api/auth/refresh` endpoint with the refresh token (expires in 30 days) to get a new one.

---

## Troubleshooting

### Services fail to start with "This server does not host this topic-partition"

This is **normal** on first start — Kafka topics are auto-created on first `publishEvent()` call. Services have a retry loop: they wait 5 seconds and retry until the topic exists. Wait 30 seconds and check again.

### Kafka container unhealthy in `docker compose ps`

The `zookeeper` healthcheck is a cosmetic issue. Kafka's `depends_on` for `zookeeper` and all services was changed to `service_started` (not `service_healthy`) so the app starts correctly. This does not affect Kafka's ability to serve requests.

### Kind cluster Kafka pod won't start

Kafka in Kind uses **KRaft mode** (no ZooKeeper). The `KAFKA_BROKER` env var must use port `9092` (client port), not `29093` (controller port). Kafka's `KAFKA_ADVERTISED_LISTENERS` must be set to `:9092`. Both are already configured in `infra/k8s/base/infra/kafka.yaml`.

### Docker build fails with "Cannot find module 'express'"

The `packages/common/package.json` must include `@types/express` and `express` as devDependencies so TypeScript can compile the `metrics.ts` file inside Docker. Add them with `npm install -w packages/common @types/express express --save-dev` after any change to `packages/common`.

### Consumer group conflicts

Each service uses its own Kafka client instance (keyed by consumer group ID). Do not change the `getKafkaClient()` calls to use a shared singleton — this was a bug that caused all services to share the same KafkaJS consumer, resulting in `GROUP_ID` conflicts.

See **[Development Logs and Decisions.md](Development%20Logs%20and%20Decisions.md)** for a detailed troubleshooting log.

---

## Cleanup

### Stop all containers (remove from memory, keep images)

```bash
docker compose -f infra/docker-compose.yml down
```

This stops all running containers. Docker images are preserved locally.

### Remove all containers + volumes (full reset — destroys data)

```bash
docker compose -f infra/docker-compose.yml down -v
```

> **Warning:** This destroys all data in PostgreSQL, MongoDB, and Redis. Orders, users, and cart data will be permanently deleted.

### Delete service images (free disk space)

```bash
docker rmi infra-auth-service:latest \
  infra-product-service:latest \
  infra-cart-service:latest \
  infra-order-service:latest \
  infra-payment-service:latest \
  infra-notification-service:latest \
  infra-frontend:latest
```

Or with Docker Compose:
```bash
docker compose -f infra/docker-compose.yml down --rmi local
```

### Remove all platform data (images + volumes)

```bash
docker compose -f infra/docker-compose.yml down -v --rmi local
```

### Delete Kind cluster

```bash
kind delete cluster --name cloudcommerce
```

### Delete Terraform state (LocalStack resources)

```bash
make tf-localstack-destroy
make tf-k8s-destroy
```

### Remove Docker leftover networks and build cache

```bash
docker network prune -f
docker builder prune -af
```

### Full cleanup checklist (complete removal from PC)

Run in order:

```bash
# 1. Stop everything
docker compose -f infra/docker-compose.yml down -v --rmi local

# 2. Delete Kind cluster
kind delete cluster --name cloudcommerce

# 3. Remove LocalStack/Terraform state
make tf-localstack-destroy 2>/dev/null || true
make tf-k8s-destroy         2>/dev/null || true

# 4. Remove Docker artifacts
docker network prune -f
docker builder prune -af
docker system prune -af --volumes

# 5. Delete the project directory
cd ..
rm -rf "cloud commerrce"

# 6. Remove kind kubeconfig
rm -f "$HOME/.kind/kubeconfig"
```

> **Note:** Terraform state for `infra/terraform/localstack/` and `infra/terraform/kubernetes/` is local to the machine. If you used remote backend (e.g., AWS S3), update the `backend` blocks in those Terraform configs and run `terraform destroy` with the remote state.

### Disk usage of major components

| Component | Approximate Size |
|-----------|-----------------|
| Node.js service images (7 × ~200MB) | ~1.4 GB |
| Infrastructure images (Kafka, Postgres, Mongo, Redis, LocalStack) | ~2 GB |
| Docker build cache | +2–5 GB |
| Kind cluster (all manifests deployed) | ~1 GB |
| Terraform state (LocalStack resources) | negligible |

---

## Contributing

Follow the ROADMAP phases in order. One service, one PR-sized unit of work. Before implementing routes, check `API_CONTRACTS.md`. If a contract needs change, update that file in the same PR.

Key rules:
- **No shared runtime code** — use `packages/common` (logger, errors, types, Kafka client)
- **Secrets never hardcoded** — use `.env` files with `.env.example` committed
- **After every development session** — update `Development Logs and Decisions.md`
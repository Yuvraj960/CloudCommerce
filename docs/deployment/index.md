# Deployment Guide

> How to deploy CloudCommerce — from a single Docker Compose command to full Kubernetes automation.

---

## Choose Your Deployment Method

| Method | When to use | What it deploys |
|--------|------------|-----------------|
| [Docker Compose](docker-compose.md) | Local dev, trying the app, CI testing | All 7 services + infra containers |
| [Kind cluster](kind.md) | Full Kubernetes locally, learning K8s patterns | All 7 services + infra in K8s pods |
| [TF + Kind](terraform.md) | Managing infra (S3, SNS, SQS, namespaces) via Terraform | Terraform-managed resources + kubectl workloads |
| [GitHub Actions](ci-cd.md) | Automated build + push + deploy on push to main | GHCR images + auto-apply to Kind (needs self-hosted runner) |

On this machine, `kubectl` defaults to `docker-desktop` context. **You must use explicit `KUBECONFIG`** for Kind operations:

```bash
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl get pods -n infra  # Kind
kubectl get pods -n default                          # docker-desktop
```

See [Kind setup →](kind.md) for full kubectl context explanation.

---

## Quick Reference

### Docker Compose (fastest)
```bash
docker compose -f infra/docker-compose.yml up -d
# All services + Kafka + Postgres + MongoDB + Redis + LocalStack
docker compose -f infra/docker-compose.yml logs -f order-service
docker compose -f infra/docker-compose.yml down
```

### Kind cluster (full Kubernetes)
```bash
# 1. Load built images into Kind (after docker build)
for svc in auth product cart order payment notification frontend; do
  kind load docker-image --name cloudcommerce $svc:local
done

# 2. Apply manifests
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/base/
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl apply -f infra/k8s/services/

# 3. Watch pods
KUBECONFIG="$HOME/AppData/Local/kind/kubeconfig" kubectl get pods -n infra -w
```

### Terraform
```bash
cd infra/terraform/localstack && terraform init && terraform apply
cd infra/terraform/kubernetes && terraform init && terraform apply \
  -var="kubeconfig_path=$HOME/.kind/kubeconfig"
```

---

## Docker Images Reference

| Service | Dockerfile | Local tag | GHCR path |
|---------|-----------|-----------|-----------|
| auth-service | `services/auth-service/Dockerfile` | `auth-service:local` | `ghcr.io/<owner>/cloudcommerce/auth-service` |
| product-service | `services/product-service/Dockerfile` | `product-service:local` | `ghcr.io/<owner>/cloudcommerce/product-service` |
| cart-service | `services/cart-service/Dockerfile` | `cart-service:local` | `ghcr.io/<owner>/cloudcommerce/cart-service` |
| order-service | `services/order-service/Dockerfile` | `order-service:local` | `ghcr.io/<owner>/cloudcommerce/order-service` |
| payment-service | `services/payment-service/Dockerfile` | `payment-service:local` | `ghcr.io/<owner>/cloudcommerce/payment-service` |
| notification-service | `services/notification-service/Dockerfile` | `notification-service:local` | `ghcr.io/<owner>/cloudcommerce/notification-service` |
| frontend | `frontend/Dockerfile` | `frontend:local` | `ghcr.io/<owner>/cloudcommerce/frontend` |

Build a service image:
```bash
# From repo root (for npm workspaces support)
docker build -f services/auth-service/Dockerfile -t auth-service:local .

# Or from service directory
cd services/auth-service && docker build -t auth-service:local .
```

---

## Infrastructure Ports

| Service | Docker Compose | Kind (via Ingress) | LocalStack |
|---------|---------------|-------------------|------------|
| auth | `localhost:3001` | `auth.cloudcommerce.local` | — |
| product | `localhost:3002` | `products.cloudcommerce.local` | — |
| cart | `localhost:3003` | `cart.cloudcommerce.local` | — |
| order | `localhost:3004` | `orders.cloudcommerce.local` | — |
| payment | `localhost:3005` | `payments.cloudcommerce.local` | — |
| notification | `localhost:3006` | `notifications.cloudcommerce.local` | — |
| frontend | `localhost:5173` | `app.cloudcommerce.local` | — |
| Kafka | `localhost:9092` | `kafka.infra.svc.cluster.local:9092` | — |
| PostgreSQL | `localhost:5432` | `postgres.infra.svc.cluster.local:5432` | — |
| MongoDB | `localhost:27017` | `mongo.infra.svc.cluster.local:27017` | — |
| Redis | `localhost:6379` | `redis.infra.svc.cluster.local:6379` | — |
| LocalStack S3 | `localhost:4566` | `localstack.infra.svc.cluster.local:4566` | `cloudcommerce-images` |

---

## Next Steps

- [Docker Compose setup →](docker-compose.md)
- [Kind cluster setup →](kind.md)
- [Terrafrom usage →](terraform.md)
- [CI/CD pipeline →](ci-cd.md)
- [Troubleshooting →](troubleshooting.md)
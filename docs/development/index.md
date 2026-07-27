# Development Guide

> Daily development workflows, debugging techniques, and service-specific gotchas.

---

## Quick Start

```bash
# Install all workspaces
npm ci

# Run a specific service in dev mode
npm run dev --workspace=services/auth-service

# Run all services locally (requires infra running)
docker compose -f infra/docker-compose.yml up -d
```

---

## Per-Service Development

| Service | Dev command | Test command |
|---------|-------------|--------------|
| auth-service | `npm run dev --workspace=services/auth-service` | `npm test --workspace=services/auth-service` |
| product-service | `npm run dev --workspace=services/product-service` | `npm test --workspace=services/product-service` |
| cart-service | `npm run dev --workspace=services/cart-service` | `npm test --workspace=services/cart-service` |
| order-service | `npm run dev --workspace=services/order-service` | `npm test --workspace=services/order-service` |
| payment-service | `npm run dev --workspace=services/payment-service` | `npm test --workspace=services/payment-service` |
| notification-service | `npm run dev --workspace=services/notification-service` | `npm test --workspace=services/notification-service` |
| frontend | `npm run dev --workspace=frontend` | `npm test --workspace=frontend` |

---

## Building Shared Package

`packages/common` must be compiled before services that import it:

```bash
npm run build --workspace=packages/common
```

This produces `dist/` output consumed by all services. Re-run after any change to `packages/common/src/`.

---

## Running Tests

```bash
# All workspaces
npm test --workspaces --if-present

# One service
npm test --workspace=services/auth-service

# With coverage
npm test --workspace=services/auth-service -- --coverage
```

---

## Environment Files

Each service has a `.env.example` committed to git. Copy to `.env` before running:

```bash
cp services/auth-service/.env.example services/auth-service/.env
```

Key variables per service:

| Service | Key env vars |
|---------|-------------|
| auth-service | `DATABASE_URL`, `JWT_SECRET`, `PORT=3001` |
| product-service | `MONGODB_URI`, `S3_ENDPOINT`, `PORT=3002` |
| cart-service | `REDIS_URL`, `PORT=3003` |
| order-service | `DATABASE_URL`, `KAFKA_BROKER`, `PORT=3004` |
| payment-service | `DATABASE_URL`, `KAFKA_BROKER`, `PORT=3005` |
| notification-service | `KAFKA_BROKER`, `PORT=3006` |
| frontend | `VITE_API_URL`, `VITE_AUTH_URL` |

---

## Service Health Checks

When all services are running via Docker Compose:

| Service | Health check |
|---------|-------------|
| auth-service | `curl http://localhost:3001/health` |
| product-service | `curl http://localhost:3002/health` |
| cart-service | `curl http://localhost:3003/health` |
| order-service | `curl http://localhost:3004/health` |
| payment-service | `curl http://localhost:3005/health` |
| notification-service | `curl http://localhost:3006/health` |

---

## Kafka Consumer Testing

To verify a Kafka consumer is working:

```bash
# 1. Produce a test event via kafka-console
docker exec -it kafka kafka-console-producer --bootstrap-server localhost:9092 --topic order_created

# Then paste JSON:
{"orderId":"test-123","userId":"test-user","items":[{"productId":"64abc123def456789abc001","quantity":2}],"totalAmount":2999,"createdAt":"2025-01-01T00:00:00Z"}

# 2. Check consumer logs
docker compose -f infra/docker-compose.yml logs -f payment-service
docker compose -f infra/docker-compose.yml logs -f notification-service
```

On Kind, use `kubectl logs -n <namespace> <pod-name>` instead.

---

## Related Docs

- [Debugging guide →](debugging.md)
- [Service-specific gotchas →](services/index.md)
- [API contracts →](../../API_CONTRACTS.md)
- [Troubleshooting →](../deployment/troubleshooting.md)
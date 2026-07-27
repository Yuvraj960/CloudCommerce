# Architecture Overview

> System design decisions, service responsibilities, and how CloudCommerce is structured.

---

## High-Level Diagram

```
                        ┌──────────────────────────────────────────────────────────────────┐
                        │                        Frontend (React/Vite)                    │
                        │                   app.cloudcommerce.local:5173                   │
                        └────────────────────────────┬────────────────────────────────────┘
                                                       │ HTTP / JWT
           ┌───────────────────────────────────────────┼───────────────────────────────────┐
           │                                           │                                   │
      ┌────▼─────┐  ┌───────────┐  ┌──────────┐  ┌───┴───┐  ┌──────────┐  ┌──────────┐  │
      │Auth      │  │  Product  │  │  Cart   │  │Order  │  │ Payment  │  │Notifica- │  │
      │Service   │  │  Service  │  │ Service │  │Service│  │ Service  │  │  tion    │  │
      │:3001     │  │  :3002    │  │  :3003  │  │:3004  │  │  :3005   │  │  :3006   │  │
      └────┬─────┘  └─────┬─────┘  └────┬────┘  └───┬──┘  └─────┬────┘  └──────────┘  │
           │              │              │            │            │                    │
     ┌─────▼──────┐  ┌───▼──────┐  ┌──▼──────┐  ┌──▼──────────▼───┐                     │
     │PostgreSQL │  │ MongoDB   │  │ Redis   │  │   Apache Kafka   │                     │
     │:5432      │  │ :27017   │  │ :6379   │  │   :9092 (KRaft)  │                     │
     └───────────┘  └──────────┘  └─────────┘  │                 │                     │
                                                  │  ┌─────────┐   │                     │
                                                  │  │ Local   │   │                     │
                                                  │  │ Stack   │   │                     │
                                                  │  │ :4566   │   │                     │
                                                  │  │ (S3/SNS │   │                     │
                                                  │  │  /SQS)  │   │                     │
                                                  │  └─────────┘   │                     │
                                                  └──────────────────┘                     │
                                                      Kafka Events                           │
                                          order_created → payment, notification           │
                                          payment_success/failed → order, notification    │
                                          order_completed/cancelled → notification         │
```

---

## Services

### Auth Service (Port 3001)
**Database:** PostgreSQL
**Responsibility:** JWT issuance, refresh tokens, user registration/login

- PostgreSQL schema: `users`, `refresh_tokens` tables
- JWT access tokens (short-lived, 15 min) + refresh tokens (7 days, bcrypt-hashed)
- Middleware: `requireAuth`, `requireRole('admin' | 'customer')`
- No Kafka involvement — pure REST API

**Key file:** `services/auth-service/src/middleware/auth.ts`

---

### Product Service (Port 3002)
**Database:** MongoDB (Mongoose)
**Responsibility:** Product CRUD, categories, search, S3 image upload, stock management

- Mongoose schemas: `Product`, `Category`
- S3 uploads go to LocalStack (configured with `forcePathStyle: true`)
- Atomic stock guard: `findOneAndUpdate({ _id, stock: { $gte: quantity } }, { $inc: { stock: -quantity } })` — prevents over-selling
- Also consumes `order_cancelled` events to restock items

**Key file:** `services/product-service/src/models/product.ts`

---

### Cart Service (Port 3003)
**Database:** Redis (ioredis)
**Responsibility:** Per-user shopping cart, quantity management

- Redis hash: `cart:{userId}` → `{ productId: quantity, ... }`
- Operations: `HINCRBY` (add qty), `HDEL` (remove), `DEL` (clear)
- 7-day TTL on every write
- JWT-gated — requires `Authorization: Bearer <token>` header

**Key file:** `services/cart-service/src/index.ts`

---

### Order Service (Port 3004)
**Database:** PostgreSQL
**Responsibility:** Order creation, state machine, Kafka event publishing

- State machine: `created → completed | cancelled`
- State changes driven **only** by Kafka consumer events (no direct REST state mutation)
- Publishes: `order_created`, `order_completed`, `order_cancelled`

**State machine diagram:**
```
[POST /orders] → created ──► payment_success ──► completed
                      │
                      └──────► payment_failed ──► (stays created, can retry)
                      │
                      └──────► order_cancelled ──► cancelled
```

**Key file:** `services/order-service/src/kafka/consumer.ts`

---

### Payment Service (Port 3005)
**Database:** PostgreSQL
**Responsibility:** Simulated payment processing, Kafka event publishing

- Consumes `order_created` events from `order_created` topic
- Random success/failure simulation (configurable probability)
- Publishes: `payment_success`, `payment_failed`
- Updates internal payment record via Kafka (event consistency, not direct DB)

**Key file:** `services/payment-service/src/kafka/consumer.ts`

---

### Notification Service (Port 3006)
**Database:** None
**Responsibility:** Email simulation (logs) triggered by all 5 Kafka events

- Consumes all 5 event topics (no REST API)
- Logs each event type to console: `[Email] Sending order_confirmation to user@example.com`
- Idempotent — same event processed multiple times by different replicas = same output

---

### Frontend (Port 5173)
**Stack:** Vite + React + Tailwind CSS + Zustand (state management)
**Responsibility:** User-facing SPA — product browsing, auth, cart, checkout, order history

- Auth via JWT stored in localStorage
- Zustand stores: cart, auth user, orders
- Calls all backend services via their port (not through ingress locally)

---

## Data Stores

| Store | Technology | Used by | Data |
|-------|-----------|---------|------|
| PostgreSQL | pg Pool (no ORM) | Auth, Order, Payment, Notification | Users, orders, payments, refresh tokens |
| MongoDB | Mongoose | Product | Products, categories, stock |
| Redis | ioredis (lazyConnect) | Cart | Shopping carts (hashes with TTL) |
| LocalStack S3 | AWS SDK | Product | Product images |

---

## Kafka Event Flow

See full data flow diagram: [Data Flow →](data-flow.md)

All Kafka connectivity is via `packages/common/src/kafka.ts` (shared singleton client):

```typescript
// Service creates a Kafka client at startup
export const kafka = new Kafka({
  clientId: process.env.SERVICE_NAME ?? 'cloudcommerce-service',
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  retry: { initialRetryTime: 100, retries: 8 }
})
```

Events are defined in [`API_CONTRACTS.md`](../../API_CONTRACTS.md). Always update that file before creating a new event type.

---

## Kubernetes Architecture

```
infra/namespace
├── postgres    (Deployment, 1 replica)
├── mongo       (Deployment, 1 replica)
├── redis       (Deployment, 1 replica)
├── kafka       (StatefulSet, 1 replica, KRaft mode)
├── localstack  (Deployment, 1 replica)
└── zookeeper   (Deployment, 1 replica, only for ZK-mode Kafka — not used in Kind)
```

```
<service>-namespace (×7: auth, product, cart, order, payment, notification, frontend)
└── <service>       (Deployment, 2 replicas for order/payment/notification, 1 for others)
```

See [Kind setup →](../deployment/kind.md) for full Kubernetes deployment instructions.

---

## Key Architectural Decisions

| Decision | Why | Documented in |
|-----------|-----|--------------|
| No shared runtime code | Each service is independently deployable | CLAUDE.md rule #5 |
| Kafka state machine | Order status changes driven by events only | [Data Flow →](data-flow.md) |
| Late-binding JWT_SECRET | Tests can inject env at runtime | CLAUDE.md patterns |
| dotenv loaded first | Prevents relative path resolution issues | CLAUDE.md patterns |
| npm workspaces | Shared `packages/common` compilation in CI | [`infra/Makefile`](../../infra/Makefile) |
| KRaft (no ZooKeeper) | Simpler for local dev, no extra container | [Kafka deep-dive →](kafka.md) |
| Dual-listener Kafka | Separates client (9092) and controller (29093) traffic | [Kafka deep-dive →](kafka.md) |
| S3 with forcePathStyle | LocalStack compatibility, path-style URLs only | CLAUDE.md patterns |
| Atomic stock guard | Prevents race conditions on concurrent purchase | services/product-service |

---

## Network Policy

In Kind, all services can reach all other services within the cluster using their K8s DNS:

```
auth-service:3001        → auth.infra.svc.cluster.local:3001 (if in infra)
payment-service:3005     → payment.notification.svc.cluster.local:3005
```

Services connect to infra services via:
```
kafka.infra.svc.cluster.local:9092    (Kafka — client port)
postgres.infra.svc.cluster.local:5432  (PostgreSQL)
mongo.infra.svc.cluster.local:27017   (MongoDB)
redis.infra.svc.cluster.local:6379   (Redis)
localstack.infra.svc.cluster.local:4566  (S3, SNS, SQS)
```

---

## Related Docs

- [Kafka deep-dive →](kafka.md)
- [Data flow and event diagrams →](data-flow.md)
- [API contracts →](../../API_CONTRACTS.md)
- [Troubleshooting →](../deployment/troubleshooting.md)
# Docker Compose Deployment

> The fastest way to run all services locally — no Kubernetes required. Everything runs as Docker containers on your machine.

---

## Quick Start

```bash
# From repo root
docker compose -f infra/docker-compose.yml up -d

# Watch logs
docker compose -f infra/docker-compose.yml logs -f

# Stop everything
docker compose -f infra/docker-compose.yml down
```

---

## What Gets Started

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `postgres` | `postgres:16` | `5432` | Auth service database |
| `mongo` | `mongo:7` | `27017` | Product service database |
| `redis` | `redis:7-alpine` | `6379` | Cart service storage |
| `kafka` | `confluentinc/cp-kafka:7.6.0` | `9092` | Event streaming (ZooKeeper mode) |
| `zookeeper` | `confluentinc/cp-zookeeper:7.6.0` | `2181` | Kafka coordination (ZooKeeper mode) |
| `localstack` | `localstack/localstack:3` | `4566` | AWS mock (S3, SNS, SQS) |
| `auth-service` | built locally | `3001` | JWT authentication |
| `product-service` | built locally | `3002` | Products, categories, S3 upload |
| `cart-service` | built locally | `3003` | Redis-backed shopping cart |
| `order-service` | built locally | `3004` | Order creation + Kafka producer |
| `payment-service` | built locally | `3005` | Kafka consumer, payment processing |
| `notification-service` | built locally | `3006` | Kafka consumer, email simulation |
| `frontend` | built locally | `5173` | React/Vite web app |

---

## Pre-requisites

1. **Docker Desktop** installed and running
2. **Docker Compose v2** (built into Docker Desktop `docker compose` CLI — don't use `docker-compose` v1)
3. All service images built locally (do this once):

```bash
# Build all service images (from repo root)
for svc in auth product cart order payment notification; do
  docker build -f services/$svc-service/Dockerfile -t $svc-service:local .
done
docker build -f frontend/Dockerfile -t frontend:local .
```

Or rebuild only one service:
```bash
docker build -f services/product-service/Dockerfile -t product-service:local .
```

---

## Kafka in Docker Compose (ZooKeeper Mode)

Unlike Kind (which uses KRaft), Docker Compose uses **ZooKeeper mode** for Kafka — more battle-tested for docker-compose scenarios.

Critical difference:
```yaml
# Docker Compose Kafka
KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092
KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092   # <-- Docker service name, not localhost!

# Kind (KRaft)
KAFKA_ZOOKEEPER_CONNECT: dummy   # <-- not needed
KAFKA_PROCESS_ROLES: broker,controller
```

**Services inside Docker Compose must use `kafka:9092` (the Docker service name), NOT `localhost:9092`**

This is already configured in the service containers' `KAFKA_BROKER` env var.

---

## LocalStack Setup (S3)

LocalStack must have the S3 bucket pre-created before product-service can upload images:

```bash
# Create the bucket (required once per LocalStack lifetime)
curl -X PUT "http://localhost:4566/cloudcommerce-images"

# Verify
curl "http://localhost:4566/cloudcommerce-images"   # should return XML error (bucket exists)
```

This is handled in `infra/docker-compose.yml` via an init container on `localstack`. If you restart LocalStack and uploads fail, re-create the bucket.

---

## Environment Variables (Services)

Each service reads its `.env` file via `dotenv`. The `.env` files are at:
- `services/auth-service/.env`
- `services/product-service/.env`
- `services/cart-service/.env`
- `services/order-service/.env`
- `services/payment-service/.env`
- `services/notification-service/.env`
- `frontend/.env`

These are bind-mounted in `docker-compose.yml` so you can edit them locally without rebuilding.

### Key env vars for Docker Compose

| Service | Env var | Docker Compose value | Purpose |
|---------|---------|---------------------|---------|
| All | `NODE_ENV` | `production` | Optimized runtime mode |
| All | `PORT` | varies | Service port |
| product | `S3_ENDPOINT` | `http://localstack:4566` | LocalStack S3 endpoint |
| product | `AWS_ACCESS_KEY` | `test` | LocalStack credentials |
| Kafka services | `KAFKA_BROKER` | `kafka:9092` | Kafka bootstrap server |

---

## Rebuilding Services

After changing service code, rebuild and restart:

```bash
# Rebuild one service
docker build -f services/product-service/Dockerfile -t product-service:local .
docker compose -f infra/docker-compose.yml up -d product-service

# Rebuild all and restart
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
```

---

## Port Access

Once all containers are running:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Auth API | http://localhost:3001 |
| Product API | http://localhost:3002 |
| Cart API | http://localhost:3003 |
| Order API | http://localhost:3004 |
| Payment API | http://localhost:3005 |
| Notification API | http://localhost:3006 |
| LocalStack Dashboard | http://localhost:4566 |

### Health Check
```bash
curl http://localhost:3001/health   # auth
curl http://localhost:3002/health   # product
curl http://localhost:3009/health   # cart
curl http://localhost:3004/health   # order
curl http://localhost:3005/health   # payment
curl http://localhost:3006/health   # notification
```

---

## Database Initialization

### PostgreSQL (Auth, Order, Payment)
Run automatically via `migrate()` in each service's `index.ts`. Uses `CREATE TABLE IF NOT EXISTS` — idempotent.

### MongoDB (Product)
Schema-less. Mongoose connects at startup. Collections created on first write.

### Redis (Cart)
No initialization needed. Keys are created on first `HSET`.

---

## Common Docker Compose Commands

```bash
# Start all
docker compose -f infra/docker-compose.yml up -d

# Start specific services (e.g. only infrastructure)
docker compose -f infra/docker-compose.yml up -d postgres mongo redis kafka localstack

# Follow logs for a specific service
docker compose -f infra/docker-compose.yml logs -f order-service

# Rebuild after code change
docker compose -f infra/docker-compose.yml build order-service
docker compose -f infra/docker-compose.yml up -d order-service

# See all running containers
docker compose -f infra/docker-compose.yml ps

# Remove everything (including volumes — DATA LOSS!)
docker compose -f infra/docker-compose.yml down -v

# Remove without volumes (preserves data)
docker compose -f infra/docker-compose.yml down
```

---

## Connecting to the Containers

```bash
# Drop into postgres
docker exec -it cloudcommerc-postgres-1 psql -U cloudcommerce -d cloudcommerce

# Check Redis
docker exec -it cloudcommerc-redis-1 redis-cli ping

# List Kafka topics
docker exec -it cloudcommerc-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list

# Watch Kafka consumer group lag
docker exec -it cloudcommerc-kafka-1 kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group payment-service-group

# Check LocalStack S3
aws --endpoint-url=http://localhost:4566 s3 ls s3://cloudcommerce-images/
```

Requires AWS CLI with LocalStack configuration. Install: `pip install awscli-local`

---

## Important: Kafka Topic Auto-Creation

**Do NOT pre-create Kafka topics.** All topics (`order_created`, `order_completed`, `order_cancelled`, `payment_success`, `payment_failed`) are auto-created by KafkaJS when each service first publishes.

Consumer logs showing `No leader for this topic-partition` during startup is **normal** — Kafka is electing a leader. Wait 10-30 seconds.

---

## Troubleshooting Docker Compose

| Problem | Fix |
|---------|-----|
| Kafka container won't start | Check `KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092` — must use Docker service name |
| Product image uploads fail | `curl -X PUT http://localhost:4566/cloudcommerce-images` to pre-create S3 bucket |
| Services can't reach Kafka | All services use `kafka:9092` (Docker service name) — NOT localhost |
| Port already in use | Another process has the port; `netstat -ano \| findstr 3004` to find it |
| `docker compose` command not found | Upgrade Docker Desktop to v2+; older versions use `docker-compose` (v1) |

For full troubleshooting, see: [Troubleshooting →](troubleshooting.md)
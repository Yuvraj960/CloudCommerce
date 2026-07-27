# Kafka — Deep Dive

> Complete reference for Kafka configuration, KRaft mode, events, and common pitfalls.

---

## KRaft Mode Overview

CloudCommerce uses **KRaft mode** (no ZooKeeper) for Kafka. This means Kafka itself handles controller quorum using an internal Raft consensus protocol, instead of relying on ZooKeeper.

**Key advantage:** One less container to manage, simpler Kind deployment.
**Key complexity:** Controller quorum configuration is stricter and more finicky than ZK mode.

---

## Architecture: Single-Node KRaft

```
Pod: kafka-0
┌─────────────────────────────────────────────────────────────────┐
│  Kafka Broker + Controller (same JVM)                           │
│                                                                 │
│  Client connections ──► :9092 (PLAINTEXT listener)             │
│  Controller quorum    ──► :29093 (CONTROLLER listener)          │
│  Advertised host      ──► kafka.infra.svc.cluster.local:9092   │
│                                                                 │
│  controller.quorum.voters = 1@localhost:29093                   │
│  (Broker=1 votes for itself; no external dependency)            │
└─────────────────────────────────────────────────────────────────┘
```

The broker IS the controller — they share the same process and communicate internally. No ZooKeeper, no DNS.

---

## Listener Configuration — The Critical Parts

### The Two Listeners

| Listener Name | Protocol | Port | Purpose |
|---------------|----------|------|---------|
| `PLAINTEXT` | `PLAINTEXT` | 9092 | Client connections (services → Kafka) |
| `CONTROLLER` | `PLAINTEXT` | 29093 | Controller quorum (broker → self for Raft) |

### Why Two Listeners?

- `PLAINTEXT://:9092` → advertised to clients in `KAFKA_ADVERTISED_LISTENERS` → services connect here
- `CONTROLLER://:29093` → NOT advertised → only broker internally uses it for controller quorum voting
- KRaft validation: `KAFKA_ADVERTISED_LISTENERS` must NOT contain listener names from `controller.listener.names`

**If you only define one listener (PLAINTEXT on 9092) AND set `KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER`, Kafka's validation errors because `CONTROLLER` doesn't appear in `KAFKA_LISTENERS`.**

### environment Variables Explained

```bash
# What Kafka binds to
KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:29093

# What Kafka advertises TO CLIENTS (must be a hostname:port clients can reach)
KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka.infra.svc.cluster.local:9092

# Maps listener names → security protocols
# CONTROLLER and PLAINTEXT both map to PLAINTEXT (no TLS/sasl in dev)
KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT

# Tells Kafka which listener is used for Raft controller communication
KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER

# Broker-to-controller quorum voters: nodeID@host:controller_port
# Use localhost:29093 for single-node (no DNS resolution needed)
KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:29093

# KRaft tells Kafka to run both broker and controller roles in one process
KAFKA_PROCESS_ROLES=broker,controller
```

---

## Controller Quorum Voters — Why `localhost:29093`

`controller.quorum.voters` tells each broker which controller nodes it should try to talk to for Raft consensus decisions.

**For single-node:** The broker IS controller node 1. It needs to talk to itself. Options:
- `1@localhost:29093` → **WORKS** — broker talks to itself directly, no DNS lookup
- `1@kafka.infra.svc.cluster.local:29093` → **FAILS** — DNS resolves to service ClusterIP, which doesn't forward port 29093 (headless service bug)
- `1@kafka-0.infra.svc.cluster.local:29093` → **FAILS** — pod FQDN not resolvable from within the pod by Kubernetes DNS

**For production (multi-node):** Use pod-level FQDNs in `controller.quorum.voters`:
```
KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka-0.cloudcommerce.svc.cluster.local:29093,2@kafka-1.cloudcommerce.svc.cluster.local:29093
```

---

## KAFKA_ZOOKEEPER_CONNECT — Why `dummy`

The `confluentinc/cp-kafka:7.6.0` Docker image's entrypoint (`/etc/confluent/docker/run`) uses a tool called `dub` to validate environment variables before launching Kafka.

`dub ensure KAFKA_ZOOKEEPER_CONNECT` is one such validation — it will fail and prevent Kafka from starting if `KAFKA_ZOOKEEPER_CONNECT` is unset.

**The workaround:**
```yaml
# In env vars (satisfies dub)
env:
  - name: KAFKA_ZOOKEEPER_CONNECT
    value: "dummy"

# In command (prevents it from being actually used)
command: ["bash", "-c", "
  unset KAFKA_ZOOKEEPER_CONNECT  # bash unsets it before exec /etc/confluent/docker/run
  ...
"]
```

The `unset` is needed because the confluent entrypoint reads KAFKA_ZOOKEEPER_CONNECT from the process environment (already set as a K8s env var), not from bash exports. So we satisfy dub with the env var, then unset it before Kafka runs.

---

## CLUSTER_ID — Valid Format

KRaft requires a valid 22-character base64 string of a 16-byte UUID.

Generate a valid one:
```bash
node -e "console.log(Buffer.from(require('crypto').randomUUID().replace(/-/g,''),'hex').toString('base64'))"
# Output: PsUQhyizSbmLweamXxvmqw==
```

`PsUQhyizSbmLweamXxvmqw==` is the current value in `kafka-kraft-direct.yaml`.

**Why this matters:** Kafka's `StorageTool` validates that the CLUSTER_ID in the data directory matches what's passed in config. If you change it to a different format (e.g., "auto" or an invalid string), Kafka throws:
```
ConfigException: Cluster ID string X does not appear to be a valid UUID
```

**If CLUSTER_ID is wrong:** Kafka fails to start, `broker-1-raft-io-thread` logs errors about invalid cluster metadata.

**Fix:** Wipe `/var/lib/kafka/data` in the PVC and restart. Or use the wipe pod: [Troubleshooting →](../deployment/troubleshooting.md#kafka-crashloop)

---

## Kafka Events {#events}

All events are defined in [`API_CONTRACTS.md`](../../API_CONTRACTS.md). This is the **source of truth** — never create a new event without updating that file.

### Event Types

| Event | Producer | Consumers |
|-------|----------|-----------|
| `order_created` | Order Service | Payment Service, Notification Service |
| `order_completed` | Order Service | Notification Service |
| `order_cancelled` | Order Service | Notification Service, **Product Service** (restock) |
| `payment_success` | Payment Service | Order Service, Notification Service |
| `payment_failed` | Payment Service | Order Service, Notification Service |

Key rules:
- Events use **lowercase snake_case** topic names (same as event name)
- Each topic has one partition in dev (replication factor = 1)
- Consumer groups use format `<service-name>-group` so multiple replicas don't duplicate processing

### Publishing an Event (KafkaJS)

```typescript
import { publishEvent, TOPICS } from '@cloudcommerce/common'

await publishEvent(TOPICS.ORDER_CREATED, {
  orderId: order.id,
  userId: user.id,
  items: orderItems,
  totalAmount: Number(order.totalAmount),
  createdAt: new Date().toISOString()
})

// TOPICS is a const enum exported from @cloudcommerce/common
// Values: { ORDER_CREATED: 'order_created', ORDER_COMPLETED: 'order_completed', ... }
```

### Consuming Events (KafkaJS)

```typescript
import { createConsumer } from '@cloudcommerce/common'

const consumer = createConsumer('payment-service-group')

await consumer.connect()
await consumer.subscribe({
  topics: [TOPICS.ORDER_CREATED],
  fromBeginning: false
})

await consumer.run({
  eachMessage: async ({ topic, message }) => {
    const payload = JSON.parse(message.value!.toString())
    // Process event...
  }
})
```

---

## LocalStack S3 — forcePathStyle

Product-service uses `forcePathStyle: true` when creating S3 clients:
```typescript
const s3 = new S3Client({
  forcePathStyle: true,           // Required for LocalStack
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:4566'
})
```

**Without `forcePathStyle: true`:** AWS SDK tries virtual-hosted style URLs (`https://bucket.s3.region.localstack.cloud`) which LocalStack doesn't support.

**Resulting URLs:** `http://localhost:4566/cloudcommerce-images/myimage.jpg` (path-style, LocalStack works with these)

---

## Kafka KRaft Complete Working Configuration

```yaml
# infra/k8s/base/kafka-kraft-direct.yaml
containers:
  - name: kafka
    image: confluentinc/cp-kafka:7.6.0
    ports:
      - containerPort: 9092; name: kafka
      - containerPort: 29093; name: controller
    command: ["bash", "-c", "
      unset KAFKA_ZOOKEEPER_CONNECT KAFKA_PORT KAFKA_CLIENT_PORT \
            KAFKA_ZOOKEEPER_CLIENT_PORT KAFKA_CONTROLLER_QUORUM_VOTERS
      export KAFKA_NODE_ID=1
      export CLUSTER_ID=PsUQhyizSbmLweamXxvmqw==
      export KAFKA_PROCESS_ROLES=broker,controller
      export KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:29093
      export KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka.infra.svc.cluster.local:9092
      export KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      export KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER
      export KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT
      export KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:29093
      export KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1
      export KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1
      export KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1
      export KAFKA_LOG_DIRS=/var/lib/kafka/data
      exec /etc/confluent/docker/run
    "]
    env:
      - name: KAFKA_ZOOKEEPER_CONNECT; value: "dummy"
      - name: KAFKA_HEAP_OPTS; value: "-Xmx768m"
```

---

## Kafka vs Docker Compose (ZK Mode)

Docker Compose uses ZK mode Kafka (different image tag supports ZooKeeper):

| Setting | Docker Compose (ZK mode) | Kind (KRaft mode) |
|---------|-------------------------|------------------|
| `KAFKA_ZOOKEEPER_CONNECT` | `zookeeper:2181` | `dummy` (unset in bash) |
| `KAFKA_PROCESS_ROLES` | (not set) | `broker,controller` |
| `CLUSTER_ID` | (not set) | `PsUQhyizSbmLweamXxvmqw==` |
| `KAFKA_CONTROLLER_QUORUM_VOTERS` | (not needed) | `1@localhost:29093` |
| `KAFKA_CONTROLLER_LISTENER_NAMES` | (not needed) | `CONTROLLER` |
| Advertised listener | `kafka:9092` (service name) | `kafka.infra.svc.cluster.local:9092` |
| Topics auto-created? | Yes | Yes |

---

## Common Kafka Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `IllegalArgumentException: controller.listener.names must contain...` | `KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER` but no `CONTROLLER` listener defined | Add dual-listener: `KAFKA_LISTENERS=PLAINTEXT://9092,CONTROLLER://29093` |
| `advertised.listeners config must not contain KRaft controller listeners` | Tried to advertise port 29093 to clients | Use `PLAINTEXT://:9092` for client (port 9092), keep `CONTROLLER://:29093` for quorum only |
| `controller.quorum.voters must contain a parseable set of voters` | Votes format wrong or unset | `1@localhost:29093` |
| `localhost:9092 could not be established` | Wrong port in `controller.quorum.voters` | Use 29093 for controller, 9092 for clients |
| `Cluster ID string X does not appear to be a valid UUID` | CLUSTER_ID format wrong | Generate valid: `node -e "..."` and wipe PVC |
| `BrokerToControllerChannelManager ... disconnected` | service DNS resolving to ClusterIP for port 29093 on a headless service | Use `localhost:29093` for single-node KRaft |
| `UnknownHostException: kafka-0.infra.svc.cluster.local` | Pod FQDN not resolvable from within the pod | Use `localhost` |
| `No leader for this topic-partition` | Leader election in progress | Wait 10-30s — normal during Kafka startup |
| `The group is rebalancing, re-joining` | Consumer group rebalancing on startup | Normal startup behavior; not an error |

---

## Related Docs

- [Data flow →](data-flow.md)
- [API contracts →](../../API_CONTRACTS.md)
- [Troubleshooting →](../deployment/troubleshooting.md)
- [Docker Compose deployment →](../deployment/docker-compose.md)
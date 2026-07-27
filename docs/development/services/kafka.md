# Kafka Development Notes

> Key Kafka patterns and gotchas for CloudCommerce developers.

---

## Event Publishing

```typescript
import { publishEvent, TOPICS } from '@cloudcommerce/common'

await publishEvent(TOPICS.ORDER_CREATED, {
  orderId: order.id,
  userId: user.id,
  items: orderItems,
  totalAmount: Number(order.totalAmount),
  createdAt: new Date().toISOString()
})
```

Always use the exported `TOPICS` const enum from `packages/common` — never hardcode topic name strings.

---

## Event Consuming

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

## Consumer Groups

| Service | Consumer Group |
|---------|----------------|
| payment-service | `payment-service-group` |
| order-service | `order-service-group` |
| notification-service | `notification-service-group` |
| product-service | `product-service-group` |

Each service uses exactly one consumer group. All replicas of a service share the same group — Kafka distributes partitions across replicas automatically.

---

## KafkaJS Retry Behavior

KafkaJS retries failed message processing with exponential backoff:

```typescript
const kafka = new Kafka({
  clientId: 'payment-service',
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  retry: {
    initialRetryTime: 100,  // ms
    retries: 8             // max attempts
  }
})
```

If a consumer throws an exception, KafkaJS re-delivers the message after the retry interval. Design handlers to be **idempotent** — same event processed twice = same result.

---

## Topic Auto-Creation

Topics are created automatically on first publish. No pre-creation needed.

```
Topics created:
  order_created        (1 partition, replication.factor=1)
  order_completed
  order_cancelled
  payment_success
  payment_failed
```

---

## KRaft vs ZK Mode Ports

| Environment | Mode | Kafka Broker Port | Controller Port |
|-------------|------|-------------------|-----------------|
| Docker Compose | ZK mode | 9092 | 9092 (same port) |
| Kind (KRaft) | KRaft | 9092 | 29093 (separate) |

**Dev machine connecting to Kafka from outside container/pod always uses port 9092.**

---

## Key Env Var

```bash
# Services → Kafka
KAFKA_BROKER=kafka:9092                    # Docker Compose
KAFKA_BROKER=kafka.infra.svc.cluster.local:9092  # Kind
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection refused` | Wrong broker port | Use 9092, not 29093 |
| `No leader for partition` | Partition leader election in progress | Wait 10-30s after startup |
| `Group is rebalancing` | Normal on startup/concurrent consumers | Not an error — wait for rebalance to complete |

---

## Simulating Events for Testing

```bash
# Open kafka console producer
docker exec -it kafka kafka-console-producer --bootstrap-server localhost:9092 --topic order_created

# Paste JSON (no extra quotes):
{"orderId":"test-123","userId":"test-user","items":[{"productId":"64abc123def456789abc001","quantity":2,"price":1499}],"totalAmount":2998,"createdAt":"2025-01-01T00:00:00Z"}

# Watch notification-service logs
docker compose -f infra/docker-compose.yml logs -f notification-service
```

---

## Related Docs

- [Kafka deep-dive →](../../architecture/kafka.md)
- [Data flow →](../../architecture/data-flow.md)
- [Troubleshooting →](../../deployment/troubleshooting.md)
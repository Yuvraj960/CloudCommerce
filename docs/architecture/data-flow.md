# Data Flow

> How a request flows through the CloudCommerce system — from user action to service-to-service event.

---

## Happy Path: Place an Order

```
Frontend (React)
   │ POST /api/orders { cart items, shippingAddress }
   │ JWT: Bearer <access_token>
   ▼
Order Service (:3004)
   │ 1. Validate JWT (requireAuth middleware)
   │ 2. Calculate totalAmount from item prices
   │ 3. BEGIN Postgres transaction
   │    INSERT orders (...status='created'...)
   │    UPDATE products stock (atomic guard)
   │    INSERT order_items (...)
   │ 4. COMMIT
   │ 5. Publish Kafka event:
   │    topic: "order_created"
   │    payload: { orderId, userId, items, totalAmount, createdAt }
   │
   ▼  (async, non-blocking)
Apache Kafka (KRaft, port 9092)
   │ 2 consumers receive the event:
   │
   ├──────────────────────┐
   │                      │
   ▼                      ▼
Payment Service      Notification Service
(:3005)              (:3006)
   │ Consumes              │ Consumes
   │ "order_created"       │ "order_created"
   │ topic                 │ topic
   │                      │ Publishes:
   │ Simulates payment    │ "email sent:
   │ (random success/     │  order_received
   │  failure ~90% ok)     │  to user@example.com"
   │                      │
   │ ┌─► success ─────────┐│
   │ │ (publish)          ▼│
   │ │ topic: "payment_success"
   │ │ payload: { orderId, paymentId, amount, paidAt }
   │ ▼                   │
   │ Kafka ──────────────┘
   │         │
   ├─────────┴────► Order Service (consumer)
   │                      │ Consumes "payment_success"
   │                      │ UPDATE orders SET status='completed'
   │                      │ Publishes:
   │                      │ topic: "order_completed"
   │                      ▼
   │               Notification Service (consumer)
   │               Publishes:
   │               "email sent:
   │                order_confirmed
   │                to user@example.com"
   │
   └─► failure ──────────────────────────────────
        (publish)
        topic: "payment_failed"
        payload: { orderId, reason, failedAt }
        │
        └─► Order Service (consumer)
                  │ Consumes "payment_failed"
                  │ Keeps status='created' (can retry payment)
                  │ Publishes:
                  │ topic: "payment_failed"
                  │ (Notification gets it too)
```

---

## Event Flow Summary

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          CloudCommerce Event Flow                             │
│                                                                               │
│  FRONTEND                                                                   │
│    │                                                                          │
│    ├──POST /api/orders ──────────────────────► Order Service                  │
│    │     GET /orders/:id ◄────────────────── Order Service                     │
│    │                                                                          │
│  ORDER SERVICE                                                                │
│    │ publish                                                                │
│    ▼                                                                        │
│  [order_created] ────────────► Payment Service                               │
│    │                                │ Consumes                                │
│    │                                │ Publishes: payment_success               │
│    │                                │          OR payment_failed             │
│    │                                ▼                                        │
│    │                          [payment_success] ──► Order Service [reconsile]  │
│    │                               │                     │                    │
│    │                               │                     │ UPDATE              │
│    │                               │                     │ orders.status=     │
│    │                               │                     │   'completed'       │
│    │                               │                     ▼                    │
│    │                               │            [order_completed]            │
│    │                               │                     │                    │
│    │                               └──────────────────────┤                    │
│    │                                                      │                    │
│    │ [payment_failed] ──────────► Order Service          │                    │
│    │                               │                     │                    │
│    │                               │                     ▼                    │
│    │                          (no status change          Notification          │
│    │                           — stays 'created')            │                │
│    │                                                       │                │
│    ▼                                                       ▼                │
│  [order_completed]                           [notifications:                 │
│  or [order_cancelled]                         order_received,                │
│                                               order_confirmed,               │
│  (from user/cancel action)                    payment_received,              │
│    │                                          payment_failed]                │
│    ▼                                                                             │
│  Notification Service ◄─────────────────────────────────────────────────────  │
│                                                                               │
│  Product Service ◄───────── [order_cancelled] ── (consume, restock)            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Order State Machine (By Event)

```
Status: created (initial)
        │
        │ payment_success event ───► status: completed
        │
        │ payment_failed event ───► status: created (unchanged, retry possible)
        │
        │ order_cancelled event ───► status: cancelled
        │ (by user order cancel)
        │
        │ order_completed event ───► status: completed
```

Only Kafka events change order status. No REST endpoint directly changes `order.status`.

---

## API Calls (REST Endpoints)

### Register/Login Flow
```
Frontend          Auth Service        Postgres
  │                    │                  │
  ├──POST /register ────►│ INSERT user ───►│
  │◄───── JWT ──────────┤                  │
  │                    │                  │
  ├──POST /login ───────►│ SELECT + bcrypt.compare
  │◄───── JWT ──────────┤                  │
```

### Browse and Buy Flow
```
Frontend          Product Service      MongoDB
  │                    │                  │
  ├──GET /products ────►│ find() ─────────►│
  │◄─── products ──────┤                  │
  │                    │                  │
  ├──GET /products/:id─►│ findOne() ◄──────│
  │◄─── product ───────┤                  │

Frontend          Cart Service         Redis
  │                    │                  │
  ├──POST /cart/items►│ HINCRBY cart:123──►│
  │◄─── updated ──────┤                  │
  ├──GET /cart ───────►│ HGETALL ─────────►│
  │◄─── cart items ──┤                  │

Frontend          Order Service       Postgres          Kafka
  │                    │                  │               │
  ├──POST /orders ─────►│ BEGIN TX ───────►│               │
  │                    │ INSERT orders ────►│               │
  │                    │ INSERT order_items ►              │
  │                    │ UPDATE stock ◄────│               │
  │                    │ COMMIT ───────────►│               │
  │                    │ publish(order_created) ─────────► Kafka
  │◄─── order object ──┤                  │               │
```

---

## Database Consistency Strategy

CloudCommerce uses **eventual consistency** via Kafka, not distributed transactions.

### Stock Reservation (Product Service)
```typescript
// Atomic stock guard — prevents overselling
const product = await Product.findOneAndUpdate(
  { _id: productId, stock: { $gte: quantity } },  // Guard query
  { $inc: { stock: -quantity } },                  // Decrement
  { new: true }
).lean()

if (!product) {
  // Either product doesn't exist (404) or stock insufficient
  // Both return 400 BadRequest to user
}
```

### Order Creation (Order Service)
```typescript
await pool.transaction(async (client) => {
  // All-or-nothing: if stock UPDATE fails, entire order is rolled back
  for (const item of items) {
    await client.query('INSERT INTO orders (...) VALUES (...)', [...])
    // Stock is reserved by atomic guard in Order Service (NOT here)
  }
})
await publishEvent(TOPICS.ORDER_CREATED, payload)  // Async, after DB commit
```

### Why Eventual Consistency Works Here
1. **Idempotency:** The payment simulation is idempotent — processing the same event twice produces the same result
2. **Stock is guarded:** The `stock >= quantity` check in `Product.findOneAndUpdate` prevents double-selling even under concurrent orders
3. **Consumer retries:** KafkaJS retries failed message processing with exponential backoff

---

## Notification Service — Pure Consumer

The notification service has **no database and no REST endpoints**. It is purely a Kafka consumer.

Types of notifications sent:
| Trigger | Email type |
|---------|-----------|
| `order_created` received | Order received confirmation |
| `payment_success` received | Payment confirmed |
| `payment_failed` received | Payment failed |
| `order_completed` received | Order completed |
| `order_cancelled` received | Order cancelled |

In production, swap the `console.log` email simulation for SendGrid/SES/etc.

---

## Frontend State Management

Zustand stores:
```typescript
// Cart store
{ userId, items: [{productId, quantity, price}], addItem, removeItem, clearCart }

// Auth store
{ user, accessToken, refreshToken, login, logout }

// Order store
{ orders, fetchOrders, placeOrder }
```

JWT access token included in all API calls:
```typescript
headers: { Authorization: `Bearer ${authStore.getState().accessToken}` }
```

Refresh token flow (automatic in `authService.getAccessToken`):
```typescript
// If accessToken expired:
// POST /api/auth/refresh { refreshToken } → new accessToken
// Retry original request
```

---

## Kafka Topic → Consumer Binding

```
Topic: order_created
  ├── Consumer group: payment-service-group
  │   └── 1 consumer instance (can scale to N)
  └── Consumer group: notification-service-group
      └── 1 consumer instance (can scale to N)

Topic: payment_success
  ├── Consumer group: order-service-group
  │   └── 2 consumer instances (for HA)
  └── Consumer group: notification-service-group
      └── 1 consumer instance

Each consumer group gets ALL events from its subscribed topic(s).
Multiple consumer groups (one per service) = fan-out pattern.
```

Scale payment-service replicas to 2: both consume order_created simultaneously → duplicate processing prevented because they share `payment-service-group`.

---

## Related Docs

- [Kafka deep-dive →](kafka.md)
- [API contracts →](../../API_CONTRACTS.md)
- [Architecture overview →](index.md)
# Service-Specific Development Notes

> Gotchas and key implementation details per service.

---

## Auth Service (Port 3001)

### JWT Secret Late Binding
```typescript
// ✅ CORRECT — resolves at call time
function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'default-fallback-for-tests'
}

// ❌ WRONG — resolved once at import time
const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback'
```

### Refresh Token Storage
- Stored as **bcrypt hash** in `refresh_tokens` table
- Compared with `bcrypt.compare()` for constant-time verification
- 7-day expiry stored as `NOW() + INTERVAL '7 days'`

### Expire JWTs with integer seconds
```typescript
// ✅ integer seconds — works with all @types/jsonwebtoken versions
const accessToken = jwt.sign(payload, secret, { expiresIn: parseInt('900') })

// ❌ string like '15m' — causes StringValue type error in @types/jsonwebtoken v9
const accessToken = jwt.sign(payload, secret, { expiresIn: '15m' })
```

---

## Product Service (Port 3002)

### S3 with LocalStack requires `forcePathStyle`
```typescript
const s3 = new S3Client({
  forcePathStyle: true,           // Required for LocalStack
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:4566'
})
```

Without `forcePathStyle: true`, AWS SDK uses virtual-hosted style URLs (`https://bucket.s3.region.localstack.cloud`) which LocalStack doesn't support.

### Atomic Stock Guard
```typescript
// Guard query: stock >= quantity (prevents overselling)
const product = await Product.findOneAndUpdate(
  { _id: productId, stock: { $gte: quantity } },
  { $inc: { stock: -quantity } },
  { new: true }
).lean()

if (!product) {
  // Either product doesn't exist (404) or stock insufficient (400)
  const exists = await Product.exists({ _id: productId })
  if (!exists) throw new NotFoundError('Product')
  throw new BadRequestError('Insufficient stock')
}
```

### MongoDB `_id` format
MongoDB `_id` is **24-character hex** — grep for IDs uses:
```typescript
// ✅ Correct pattern
const idPattern = /^[0-9a-f]{24}$/

// ❌ Not UUID — don't use UUID patterns for MongoDB _id
```

### Mongoose — Do Not Extend Document
```typescript
// ✅ Plain interface (no extends Document)
interface IProductDoc {
  _id: Types.ObjectId
  name: string
  price: number
  stock: number
}

// ❌ DON'T: interface IProduct extends Document { ... }
```

---

## Cart Service (Port 3003)

### ioredis Singleton Pattern
```typescript
let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(redisUrl, {
      lazyConnect: true,         // Don't block on connect
      enableOfflineQueue: false  // Fail fast if not connected
    })
  }
  return redis
}
```

### Redis Cart Key Format
```
cart:{userId}   →  HASH  { productId: quantity, ... }
```
- `HINCRBY cart:{userId} {productId} {quantity}` — add/update quantity
- `HDEL cart:{userId} {productId}` — remove item
- `DEL cart:{userId}` — clear entire cart
- 7-day TTL on every write: `EXPIRE cart:{userId} 604800`

---

## Order Service (Port 3004)

### State Machine Driven by Kafka Only
Order status changes **only** through Kafka consumer events — never through REST endpoints.

```
order_created  → status: created
payment_success → status: completed
payment_failed  → status: created (unchanged, can retry)
order_cancelled → status: cancelled
```

### Kafka Producer After DB Commit
```typescript
await pool.transaction(async (client) => {
  // ... INSERT orders, INSERT order_items ...
})
// Publish AFTER commit — not inside transaction
await publishEvent(TOPICS.ORDER_CREATED, payload)
```

### Postgres BIGINT → Number()
PostgreSQL `BIGINT` columns exceed JS safe integer. Always wrap in `Number()`:
```typescript
const rowToOrder = (row: OrderRow): OrderResponse => ({
  totalAmount: Number(row.total_amount),  // ✅ Prevent JSON string overflow
  // ...
})
```

---

## Payment Service (Port 3005)

### Idempotent Payment Simulation
Same `orderId` processed multiple times produces the same result — idempotent by design:
```typescript
// On receiving order_created:
// 1. Check if payment already exists for this orderId
// 2. If exists → skip (already processed)
// 3. If not → simulate payment → publish success/failed
```

### Consumer Group Prevents Duplicate Processing
Both payment-service replicas share `payment-service-group` — Kafka ensures only one replica processes each message.

---

## Notification Service (Port 3006)

### Pure Consumer — No DB, No REST
This service has:
- No PostgreSQL, no MongoDB, no Redis
- No REST endpoints (no `/health`, no routes)
- Only Kafka consumer subscribing to all 5 topics

To add a new notification type, update the consumer in `src/kafka/consumer.ts` and add the topic to `TOPICS` in `packages/common`.

---

## Frontend (Port 5173)

### Vite + React + Tailwind
- Dev: `npm run dev` (Vite HMR)
- Build: `npm run build` (production bundle)

### Zustand Stores
```typescript
// Auth store persisted to localStorage
const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      login: async (email, password) => { /* ... */ },
      logout: () => set({ user: null, accessToken: null })
    }),
    { name: 'auth-storage' }
  )
)
```

### API Base URLs
```typescript
VITE_AUTH_URL=http://localhost:3001
VITE_API_URL=http://localhost:3004
VITE_PRODUCT_URL=http://localhost:3002
VITE_CART_URL=http://localhost:3003
```

---

## Related Docs

- [Kafka debugging →](kafka.md)
- [S3 debugging →](s3.md)
- [Data flow →](../../architecture/data-flow.md)
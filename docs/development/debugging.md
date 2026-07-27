# Debugging Guide

> How to diagnose issues in CloudCommerce services — from network to Kafka to databases.

---

## Service Startup Failures

### Check pod/container status first
```bash
# Docker Compose
docker compose -f infra/docker-compose.yml ps

# Kind
kubectl get pods -A | grep -v Running

# Describe a failing pod
kubectl describe pod -n <namespace> <pod-name>
kubectl logs -n <namespace> <pod-name> --previous
```

### Common startup errors

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `ECONNREFUSED` on startup | Dependency not ready | Add health check, wait for dependency |
| `MODULE_NOT_FOUND` | Common package not built | `npm run build --workspace=packages/common` |
| `dotenv: not found` | dotenv not in node_modules | `npm ci` at root |
| `postgres error: role does not exist` | DB not initialized | Run `migrate()` — auto-runs at service startup |

---

## Kafka Issues

### Consumer not receiving events

1. **Check Kafka is running**:
```bash
# Docker Compose
docker exec kafka kafka-broker-api-versions --bootstrap-server localhost:9092

# Kind
kubectl exec -n infra kafka-0 -- kafka-broker-api-versions --bootstrap-server localhost:9092
```

2. **Check consumer group lag**:
```bash
kubectl exec -n infra kafka-0 -- kafka-consumer-groups --bootstrap-server localhost:9092 --group payment-service-group --describe
```

3. **Check topics exist** (auto-created on first produce):
```bash
kubectl exec -n infra kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --list
```

4. **Verify service is connected to Kafka**:
```bash
# Look for "Kafka connected" in logs
kubectl logs -n payment payment-service-xxx --tail=50 | grep -i kafka
```

See [Data flow →](../architecture/data-flow.md) for complete Kafka event flow.

---

## Database Connection Issues

### PostgreSQL (Auth, Order, Payment)
```bash
# Test connection from a pod
kubectl exec -n auth auth-service-xxx -- sh -c 'nc -zv postgres.infra.svc.cluster.local 5432'

# Query directly (from infra pod)
kubectl exec -n infra postgres-0 -- psql -U cloudcommerce -d cloudcommerce -c 'SELECT 1'
```

### MongoDB (Product Service)
```bash
# Test connection
kubectl exec -n product product-service-xxx -- sh -c 'nc -zv mongo.infra.svc.cluster.local 27017'

# Query directly (from infra pod)
kubectl exec -n infra mongo-0 -- mongosh --eval 'db.adminCommand("ping")'
```

### Redis (Cart Service)
```bash
# Test connection
kubectl exec -n cart cart-service-xxx -- sh -c 'nc -zv redis.infra.svc.cluster.local 6379'

# Direct query
kubectl exec -n infra redis-0 -- redis-cli PING
```

---

## S3 / LocalStack Issues

### `NoSuchBucket` when uploading
```bash
# Create the bucket
curl -X PUT "http://localhost:4566/cloudcommerce-images"

# Or on Kind
kubectl exec -n infra localstack-0 -- curl -X PUT "http://localhost:4566/cloudcommerce-images"
```

### `AccessDenied` on image upload
Verify `forcePathStyle: true` is set in S3 client config and that the LocalStack container has the `INIT_S3_BUCKET` or equivalent init script that creates `cloudcommerce-images` on startup.

---

## JWT / Auth Issues

### `401 Unauthorized`
1. Check the `Authorization: Bearer <token>` header is present in requests
2. Verify the JWT has not expired (15-minute access token)
3. If refreshing, check the refresh token hasn't expired (7 days)
4. Confirm `JWT_SECRET` matches between auth-service and client-side

### Debug JWT contents
```javascript
// Decode without verification (for debugging)
const payload = JSON.parse(atob(token.split('.')[1]))
console.log(payload)  // { sub: userId, role: 'customer', iat, exp }
```

---

## Network Debugging

### Port connectivity test
```bash
# From a pod to a service
kubectl exec -n auth auth-service-xxx -- sh -c 'nc -zv product-service 3002'
kubectl exec -n auth auth-service-xxx -- sh -c 'nc -zv kafka.infra.svc.cluster.local 9092'

# From infra pod to service
kubectl exec -n infra postgres-0 -- sh -c 'nc -zv auth-service 3001'
```

### DNS resolution test
```bash
kubectl exec -n infra kafka-0 -- nslookup kafka.infra.svc.cluster.local
kubectl exec -n infra kafka-0 -- cat /etc/resolv.conf
```

---

## Log Levels

Most services use a `LOG_LEVEL` env var (default: `info`). To increase verbosity:

```bash
# Docker Compose
LOG_LEVEL=debug docker compose -f infra/docker-compose.yml up -d

# Kind — edit the Deployment env section
env:
  - name: LOG_LEVEL
    value: "debug"
```

---

## Common Fix Flowchart

```
Issue reported
     │
     ▼
Is the pod/container running?
  ├── NO → Check Events / Logs → Fix image / env / probe
  └── YES
      │
      ▼
Is the service healthy (curl /health)?
  ├── NO → Check startup logs → Missing dep / migration error
  └── YES
      │
      ▼
Is the issue in API call?
  ├── NO → Likely Kafka consumer not working → Check consumer group lag
  └── YES → Check service logs →
    ├── Auth error (401) → JWT / refresh token
    ├── DB error → Connection / query
    └── Other → Inspect response body
```

---

## Related Docs

- [Troubleshooting →](../deployment/troubleshooting.md)
- [Kafka debugging →](services/kafka.md)
- [S3 debugging →](services/s3.md)
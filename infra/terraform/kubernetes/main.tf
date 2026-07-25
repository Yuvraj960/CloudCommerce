# ── Kubernetes Provider ────────────────────────────────────────────────────────
# Connects to the Kind cluster via kubeconfig.
# The kind cluster must exist before running `terraform apply`.
locals {
  kubeconfig_path = var.kubeconfig_path != "" ? var.kubeconfig_path : null
}

provider "kubernetes" {
  # Load config from the Kind kubeconfig file
  config_path = local.kubeconfig_path
}

# ── Namespaces ──────────────────────────────────────────────────────────────────
resource "kubernetes_namespace" "auth" {
  metadata {
    name = "auth"
    labels = {
      "app.kubernetes.io/name"       = "auth"
      "app.kubernetes.io/managed-by"  = "terraform"
      "app.kubernetes.io/part-of"    = "cloudcommerce-platform"
    }
  }
}

resource "kubernetes_namespace" "product" {
  metadata {
    name = "product"
    labels = {
      "app.kubernetes.io/name"       = "product"
      "app.kubernetes.io/managed-by"  = "terraform"
      "app.kubernetes.io/part-of"    = "cloudcommerce-platform"
    }
  }
}

resource "kubernetes_namespace" "cart" {
  metadata {
    name = "cart"
    labels = {
      "app.kubernetes.io/name"       = "cart"
      "app.kubernetes.io/managed-by"  = "terraform"
      "app.kubernetes.io/part-of"    = "cloudcommerce-platform"
    }
  }
}

resource "kubernetes_namespace" "order" {
  metadata {
    name = "order"
    labels = {
      "app.kubernetes.io/name"       = "order"
      "app.kubernetes.io/managed-by"  = "terraform"
      "app.kubernetes.io/part-of"    = "cloudcommerce-platform"
    }
  }
}

resource "kubernetes_namespace" "payment" {
  metadata {
    name = "payment"
    labels = {
      "app.kubernetes.io/name"       = "payment"
      "app.kubernetes.io/managed-by"  = "terraform"
      "app.kubernetes.io/part-of"    = "cloudcommerce-platform"
    }
  }
}

resource "kubernetes_namespace" "notification" {
  metadata {
    name = "notification"
    labels = {
      "app.kubernetes.io/name"       = "notification"
      "app.kubernetes.io/managed-by"  = "terraform"
      "app.kubernetes.io/part-of"    = "cloudcommerce-platform"
    }
  }
}

resource "kubernetes_namespace" "frontend" {
  metadata {
    name = "frontend"
    labels = {
      "app.kubernetes.io/name"       = "frontend"
      "app.kubernetes.io/managed-by"  = "terraform"
      "app.kubernetes.io/part-of"    = "cloudcommerce-platform"
    }
  }
}

resource "kubernetes_namespace" "infra" {
  metadata {
    name = "infra"
    labels = {
      "app.kubernetes.io/name"       = "infra"
      "app.kubernetes.io/managed-by"  = "terraform"
      "app.kubernetes.io/part-of"    = "cloudcommerce-platform"
    }
  }
}

# ── Secrets ─────────────────────────────────────────────────────────────────────
# NOTE: In production, use a secrets operator (SealedSecrets, Vault, etc.)
# and NEVER store plaintext secrets in Terraform state. For local dev only.

resource "kubernetes_secret" "auth_secrets" {
  metadata {
    name      = "auth-secrets"
    namespace = kubernetes_namespace.auth.metadata.0.name
  }
  data = {
    JWT_SECRET   = var.jwt_secret
    DATABASE_URL = "postgresql://${var.database_user}:${var.database_password}@${var.postgres_host}:${var.postgres_port}/${var.database_name}"
  }
  type = "Opaque"
}

resource "kubernetes_secret" "product_secrets" {
  metadata {
    name      = "product-secrets"
    namespace = kubernetes_namespace.product.metadata.0.name
  }
  data = {
    JWT_SECRET  = var.jwt_secret
    MONGODB_URI = var.mongodb_uri
  }
  type = "Opaque"
}

resource "kubernetes_secret" "cart_secrets" {
  metadata {
    name      = "cart-secrets"
    namespace = kubernetes_namespace.cart.metadata.0.name
  }
  data = {
    JWT_SECRET = var.jwt_secret
  }
  type = "Opaque"
}

resource "kubernetes_secret" "order_secrets" {
  metadata {
    name      = "order-secrets"
    namespace = kubernetes_namespace.order.metadata.0.name
  }
  data = {
    JWT_SECRET   = var.jwt_secret
    DATABASE_URL = "postgresql://${var.database_user}:${var.database_password}@${var.postgres_host}:${var.postgres_port}/${var.database_name}"
  }
  type = "Opaque"
}

resource "kubernetes_secret" "payment_secrets" {
  metadata {
    name      = "payment-secrets"
    namespace = kubernetes_namespace.payment.metadata.0.name
  }
  data = {
    DATABASE_URL = "postgresql://${var.database_user}:${var.database_password}@${var.postgres_host}:${var.postgres_port}/${var.database_name}"
  }
  type = "Opaque"
}

resource "kubernetes_secret" "notification_secrets" {
  metadata {
    name      = "notification-secrets"
    namespace = kubernetes_namespace.notification.metadata.0.name
  }
  data = {
    # notification-service has no DB credentials, only Kafka
    # Placeholder value so the secret is created
    KAFKA_GROUP = "notification-service-group"
  }
  type = "Opaque"
}

resource "kubernetes_secret" "frontend_secrets" {
  metadata {
    name      = "frontend-secrets"
    namespace = kubernetes_namespace.frontend.metadata.0.name
  }
  data = {
    VITE_API_URL = "http://auth.cloudcommerce.local"
  }
  type = "Opaque"
}

# ── Global ConfigMap ────────────────────────────────────────────────────────────
# Shared env vars consumed by multiple services via the Kubernetes ConfigMap.
# Per-service ConfigMaps (env vars directly on containers) live in the raw YAML.
resource "kubernetes_config_map" "global" {
  metadata {
    name      = "global"
    namespace = "default"
    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
  data = {
    KAFKA_BROKER             = var.kafka_broker
    LOCALSTACK_ENDPOINT       = var.localstack_endpoint
    AWS_ACCESS_KEY_ID         = "test"
    AWS_SECRET_ACCESS_KEY     = "test"
    S3_BUCKET                 = "cloudcommerce-images"
    REDIS_URL                 = "redis://redis.infra.svc.cluster.local:6379"
    KAFKAJS_NO_PARTITIONER_WARNING = "1"
  }
}
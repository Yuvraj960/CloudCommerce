variable "kubeconfig_path" {
  description = "Path to the kubeconfig file for the Kind cluster"
  type        = string
  default     = "" # Empty = use default kubeconfig chain (~/.kube/config, KUBECONFIG env, etc.)
}

variable "kind_cluster_name" {
  description = "Name of the Kind cluster"
  type        = string
  default     = "cloudcommerce"
}

variable "jwt_secret" {
  description = "Secret for signing JWT tokens — change in production"
  type        = string
  sensitive   = true
  default     = "change-me-in-production-min-32-chars-long"
}

variable "postgres_host" {
  description = "PostgreSQL cluster-internal DNS name"
  type        = string
  default     = "postgres.infra.svc.cluster.local"
}

variable "postgres_port" {
  description = "PostgreSQL port"
  type        = number
  default     = 5432
}

variable "database_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "cloudcommerce"
}

variable "database_user" {
  description = "PostgreSQL username"
  type        = string
  default     = "cloudcommerce"
}

variable "database_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
  default     = "cloudcommerce"
}

variable "mongodb_uri" {
  description = "MongoDB connection string"
  type        = string
  default     = "mongodb://mongo.infra.svc.cluster.local:27017/cloudcommerce"
}

variable "localstack_endpoint" {
  description = "LocalStack service endpoint inside the K8s cluster"
  type        = string
  default     = "http://localstack.infra.svc.cluster.local:4566"
}

variable "kafka_broker" {
  description = "Kafka broker address inside K8s (use port 29092, not 9092)"
  type        = string
  default     = "kafka.infra.svc.cluster.local:29092"
}
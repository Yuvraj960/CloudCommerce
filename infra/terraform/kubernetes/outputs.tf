output "namespace_names" {
  description = "Names of all created namespaces"
  value = [
    "auth", "product", "cart", "order",
    "payment", "notification", "frontend", "infra",
  ]
}

output "secret_names" {
  description = "Names of all created Secrets"
  value = {
    for secret in [
      kubernetes_secret.auth_secrets,
      kubernetes_secret.product_secrets,
      kubernetes_secret.cart_secrets,
      kubernetes_secret.order_secrets,
      kubernetes_secret.payment_secrets,
      kubernetes_secret.notification_secrets,
      kubernetes_secret.frontend_secrets,
    ] : secret.metadata.0.name => secret.metadata.0.namespace
  }
}

output "global_configmap_name" {
  description = "Name of the global ConfigMap"
  value       = kubernetes_config_map.global.metadata.0.name
}
# Terraform Infrastructure

> Provisioning CloudCommerce infrastructure on self-hosted Kubernetes (Kind) with Terraform.

---

## Overview

Terraform manages the Kind cluster infrastructure **and** deploys the CloudCommerce workloads to it — in two separate workspaces.

| Workspace | Purpose |
|-----------|---------|
| `infra/terraform/kubernetes/` | Provision Kind cluster + kubeconfig |
| `infra/terraform/services/` | Deploy CloudCommerce workloads to the cluster |

> **Note:** These Terraform workspaces are designed for **self-hosted** infrastructure only. Cloud runners (GitHub Actions hosted runners) cannot reach a local Kind cluster.

---

## Kubernetes Provider Configuration

The Kubernetes provider reads the Kind kubeconfig at:
```hcl
provider "kubernetes" {
  config_path = var.kubeconfig_path  # "~/.kind/kubeconfig" on Linux/macOS, "C:\\Users\\lenovo\\.kind\\kubeconfig" on Windows
}
```

Variables are defined in `variables.tf`:
```hcl
variable "kubeconfig_path" {
  description = "Path to the Kind kubeconfig file"
  type        = string
  default     = "~/.kind/kubeconfig"
}
```

---

## Kubernetes Workspace

### Resources Created

```
Kind Cluster (cloudcommerce)
├── kubeconfig export
└── (cluster provisioned via `kind create cluster`)
```

The Kubernetes workspace primarily:
1. Exports the Kind cluster's kubeconfig to a known path
2. Provides a target for the services workspace

### Init and Apply

```bash
cd infra/terraform/kubernetes
terraform init
terraform plan -var="kubeconfig_path=~/.kind/kubeconfig"
terraform apply -var="kubeconfig_path=~/.kind/kubeconfig"
```

---

## Services Workspace

Deploys all 7 CloudCommerce services and infrastructure components to the Kind cluster.

### Init and Apply

```bash
cd infra/terraform/services
terraform init
terraform plan -var="kubeconfig_path=~/.kind/kubeconfig" -var="image_tag=sha-abc1234"
terraform apply -var="kubeconfig_path=~/.kind/kubeconfig" -var="image_tag=sha-abc1234"
```

### Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `kubeconfig_path` | Path to Kind kubeconfig | `~/.kind/kubeconfig` |
| `image_tag` | Docker image tag to deploy | `latest` |
| `image_registry` | Container registry base URL | `ghcr.io/<owner>/cloudcommerce` |

---

## Kind Cluster Bootstrap

Terraform does **not** create the Kind cluster itself. Use the Makefile:

```bash
# From repo root
make kind-create         # Creates the Kind cluster
make kind-load-images    # Loads local images into Kind nodes
make kind-deploy-infra   # Deploys infra (Kafka, PostgreSQL, etc.)
make kind-deploy-services # Deploys all 7 services
make kind-status         # Check all pods
```

See [`kind.md`](./kind.md) for the complete Kind deployment workflow.

---

## Terraform State

Terraform state is stored **locally** by default. For team environments, configure a remote backend (S3, Terraform Cloud, etc.).

```hcl
terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
```

---

## Common Errors

### `Error: context deadline exceeded`
Kind cluster not running, or `kubeconfig_path` points to wrong location.

```bash
kind get clusters                           # Verify cluster exists
cat $HOME/.kind/kubeconfig | grep server   # Should show https://127.0.0.1:<port>
```

### `Error: dial tcp 127.0.0.1:59106: connect: connection refused`
Terraform provider can't reach the Kubernetes API. Verify kubectl context:

```bash
kubectl --kubeconfig="$HOME/.kind/kubeconfig" get nodes
```

### Kind kubeconfig path on Windows
```hcl
variable "kubeconfig_path" {
  default = "C:\\Users\\lenovo\\.kind\\kubeconfig"  # Windows
  # Linux/macOS: "~/.kind/kubeconfig"
}
```

---

## Related Docs

- [Kind cluster setup →](kind.md)
- [CI/CD pipeline →](ci-cd.md)
- [Docker Compose (alternative) →](docker-compose.md)
- [Troubleshooting →](troubleshooting.md)
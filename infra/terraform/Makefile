# Terraform backend configuration (local state, no remote backend needed for local dev)
# State is stored at infra/terraform/localstack/.terraform/ and kubernetes/.terraform/

.PHONY: tf-localstack-init tf-localstack-plan tf-localstack-apply tf-localstack-destroy
.PHONY: tf-k8s-init tf-k8s-plan tf-k8s-apply tf-k8s-destroy tf-k8s-outputs
.PHONY: tf-all-init tf-all-plan tf-all-apply tf-all-destroy

TERRAFORM_KINECONFIG ?= $(HOME)/AppData/Local/kind/kubeconfig
KUBECTL := kubectl --kubeconfig="$(TERRAFORM_KINECONFIG)"
TF_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
AWS_ACCESS_KEY ?= test
AWS_SECRET_KEY ?= test
LOCALSTACK_ENDPOINT ?= http://localhost:4566

# ── LocalStack (S3, SNS, SQS) ──────────────────────────────────────────────────
tf-localstack-init:
	cd $(TF_DIR)localstack && terraform init

tf-localstack-plan: tf-localstack-init
	cd $(TF_DIR)localstack && terraform plan \
		-var="aws_access_key=$(AWS_ACCESS_KEY)" \
		-var="aws_secret_key=$(AWS_SECRET_KEY)" \
		-var="localstack_endpoint=$(LOCALSTACK_ENDPOINT)"

tf-localstack-apply: tf-localstack-init
	cd $(TF_DIR)localstack && terraform apply \
		-var="aws_access_key=$(AWS_ACCESS_KEY)" \
		-var="aws_secret_key=$(AWS_SECRET_KEY)" \
		-var="localstack_endpoint=$(LOCALSTACK_ENDPOINT)"

tf-localstack-destroy:
	cd $(TF_DIR)localstack && terraform destroy

# ── Kubernetes resources ───────────────────────────────────────────────────────
# The Kind cluster must exist first (`make kind-create` from infra/Makefile)
# These create Namespaces, Secrets, and ConfigMaps in the existing cluster.
# They do NOT create Deployments/Services (those still come from YAML files).

tf-k8s-init:
	cd $(TF_DIR)kubernetes && terraform init

tf-k8s-plan: tf-k8s-init
	cd $(TF_DIR)kubernetes && terraform plan \
		-var="kubeconfig_path=$(TERRAFORM_KINECONFIG)"

tf-k8s-apply: tf-k8s-init
	cd $(TF_DIR)kubernetes && terraform apply \
		-var="kubeconfig_path=$(TERRAFORM_KINECONFIG)"

tf-k8s-destroy:
	cd $(TF_DIR)kubernetes && terraform destroy \
		-var="kubeconfig_path=$(TERRAFORM_KINECONFIG)"

# Show computed outputs
tf-k8s-outputs: tf-k8s-init
	cd $(TF_DIR)kubernetes && terraform output

# ── Combined ───────────────────────────────────────────────────────────────────
tf-all-init: tf-localstack-init tf-k8s-init

tf-all-plan: tf-localstack-plan tf-k8s-plan

tf-all-apply: tf-localstack-apply tf-k8s-apply

tf-all-destroy: tf-k8s-destroy tf-localstack-destroy
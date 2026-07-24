# Kind-based Kubernetes management for cloudcommerce
KIND_KUBECONFIG := $(HOME)/.kind/kubeconfig
KUBECTL := kubectl --kubeconfig="$(KIND_KUBECONFIG)"
KUSTOMIZE := kustomize
K8S_DIR := $(dir $(wordlength $(words $(MAKEFILE_LIST)),$(MAKEFILE_LIST)))infra/k8s

.PHONY: apply apply-infra apply-all destroy restart logs logs-auth logs-product
.PHONY: kind-create kind-load kind-delete port-forward port-forward-frontend
.PHONY: apply-monitoring port-forward-prometheus port-forward-grafana port-forward-loki
.PHONY: destroy-monitoring

# ── Cluster lifecycle ─────────────────────────────────────────────────────────
kind-create:
	kind create cluster --name cloudcommerce \
		--kubeconfig=$(KIND_KUBECONFIG) \
		--wait 5m

kind-delete:
	kind delete cluster --name cloudcommerce --kubeconfig=$(KIND_KUBECONFIG)

# ── Apply manifests ─────────────────────────────────────────────────────────────
# Apply base (namespaces, infra, secrets, configmaps) first
apply-base: $(K8S_DIR)/base
	$(KUBECTL) apply -f $(K8S_DIR)/base/namespaces.yaml
	$(KUBECTL) apply -f $(K8S_DIR)/base/configmaps.yaml
	$(KUBECTL) apply -f $(K8S_DIR)/base/secrets.yaml
	$(KUBECTL) apply -f $(K8S_DIR)/base/infra.yaml
	$(KUBECTL) apply -f $(K8S_DIR)/base/ingress.yaml
	@echo "Waiting for infra pods to be ready..."
	$(KUBECTL) wait --namespace infra --for=condition=ready pod -l app=postgres --timeout=60s 2>/dev/null || true
	$(KUBECTL) wait --namespace infra --for=condition=ready pod -l app=mongo --timeout=60s 2>/dev/null || true
	$(KUBECTL) wait --namespace infra --for=condition=ready pod -l app=redis --timeout=60s 2>/dev/null || true
	$(KUBECTL) wait --namespace infra --for=condition=ready pod -l app=localstack --timeout=120s 2>/dev/null || true
	$(KUBECTL) wait --namespace infra --for=condition=ready pod -l app=kafka --timeout=120s 2>/dev/null || true

# Apply all K8s manifests via kustomize
apply-all: apply-base
	$(KUSTOMIZE) build $(K8S_DIR) | $(KUBECTL) apply --server-side -f -
	$(KUBECTL) apply -f $(K8S_DIR)/base/hpa.yaml

# Apply just the app services (infra already running)
apply-services:
	$(KUSTOMIZE) build $(K8S_DIR) | $(KUBECTL) apply --server-side -f -
	$(KUBECTL) apply -f $(K8S_DIR)/base/hpa.yaml

# Dry-run / validate
diff:
	$(KUSTOMIZE) build $(K8S_DIR) | $(KUBECTL) diff -f -

# ── Load images into Kind ──────────────────────────────────────────────────────
# Build and load a service image into the Kind cluster
kind-load-%:
	@echo "Building and loading $* into Kind..."
	docker build -f services/$*/Dockerfile -t $*:local .
	kind load docker-image $*:local --name cloudcommerce --kubeconfig=$(KIND_KUBECONFIG)

kind-load-all: $(addprefix kind-load-, \
	auth-service product-service cart-service order-service \
	payment-service notification-service frontend)

# ── Delete ──────────────────────────────────────────────────────────────────────
destroy:
	$(KUBECTL) delete -f $(K8S_DIR)/base/hpa.yaml --ignore-not-found
	$(KUSTOMIZE) build $(K8S_DIR) | $(KUBECTL) delete -f - --ignore-not-found
	$(KUBECTL) delete -f $(K8S_DIR)/base/namespaces.yaml --ignore-not-found

# ── Wait for services ──────────────────────────────────────────────────────────
wait-services:
	@for ns in auth product cart order payment notification frontend; do \
		$(KUBECTL) wait -n $$ns --for=condition=ready pod -l app=$${ns%-service}-service --timeout=120s 2>/dev/null && echo "$$ns: ready" || echo "$$ns: FAILED"; \
	done

# ── Logs ────────────────────────────────────────────────────────────────────────
logs-%:
	$(KUBECTL) logs -l app=*-service --namespace=$* -f

# ── Port forwarding ─────────────────────────────────────────────────────────────
# Expose a service locally. Usage: make port-forward svc=auth-service ns=auth
port-forward:
	$(KUBECTL) port-forward -n $(ns) svc/$(svc) 8080:$(or $(port),3001)

port-forward-frontend:
	$(KUBECTL) port-forward -n frontend svc/frontend 5173:5173

# ── Monitoring (Prometheus + Grafana + Loki + Promtail) ─────────────────────
apply-monitoring:
	$(KUBECTL) apply -f $(K8S_DIR)/base/monitoring/namespace.yaml
	$(KUBECTL) apply -f $(K8S_DIR)/base/monitoring/prometheus/
	$(KUBECTL) apply -f $(K8S_DIR)/base/monitoring/grafana/
	$(KUBECTL) apply -f $(K8S_DIR)/base/monitoring/loki/
	$(KUBECTL) apply -f $(K8S_DIR)/base/monitoring/promtail/
	@echo "Waiting for monitoring stack to be ready..."
	$(KUBECTL) wait -n monitoring --for=condition=ready pod -l app=prometheus --timeout=120s 2>/dev/null && echo "prometheus: ready" || echo "prometheus: FAILED"
	$(KUBECTL) wait -n monitoring --for=condition=ready pod -l app=grafana --timeout=120s 2>/dev/null && echo "grafana: ready" || echo "grafana: FAILED"
	$(KUBECTL) wait -n monitoring --for=condition=ready pod -l app=loki --timeout=120s 2>/dev/null && echo "loki: ready" || echo "loki: FAILED"
	$(KUBECTL) wait -n monitoring --for=condition=ready pod -l app=promtail --timeout=120s 2>/dev/null && echo "promtail: ready" || echo "promtail: FAILED"
	@echo ""
	@echo "Monitoring stack deployed. Access:"
	@echo "  Prometheus:  make port-forward-prometheus  (→ http://localhost:9090)"
	@echo "  Grafana:      make port-forward-grafana     (→ http://localhost:3000)"
	@echo "  Loki:         make port-forward-loki        (→ http://localhost:3100)"

port-forward-prometheus:
	$(KUBECTL) port-forward -n monitoring svc/prometheus 9090:9090

port-forward-grafana:
	$(KUBECTL) port-forward -n monitoring svc/grafana 3000:3000

port-forward-loki:
	$(KUBECTL) port-forward -n monitoring svc/loki 3100:3100

destroy-monitoring:
	$(KUBECTL) delete -f $(K8S_DIR)/base/monitoring/promtail/ --ignore-not-found
	$(KUBECTL) delete -f $(K8S_DIR)/base/monitoring/loki/ --ignore-not-found
	$(KUBECTL) delete -f $(K8S_DIR)/base/monitoring/grafana/ --ignore-not-found
	$(KUBECTL) delete -f $(K8S_DIR)/base/monitoring/prometheus/ --ignore-not-found
	$(KUBECTL) delete -f $(K8S_DIR)/base/monitoring/namespace.yaml --ignore-not-found

# ── NGINX Ingress ───────────────────────────────────────────────────────────────
# Add this to /etc/hosts on macOS/Linux (or Windows\system32\drivers\etc\hosts)
# 127.0.0.1 auth.cloudcommerce.local \
#             products.cloudcommerce.local \
#             cart.cloudcommerce.local \
#             orders.cloudcommerce.local \
#             payments.cloudcommerce.local \
#             notifications.cloudcommerce.local \
#             app.cloudcommerce.local

# ── Delete completed pods (cleanup) ─────────────────────────────────────────────
cleanup-jobs:
	$(KUBECTL) delete jobs -A --field-selector=status.successful=1 --ignore-not-found

.PHONY: apply-base apply-services diff kind-load-% wait-services tf-localstack tf-k8s tf-all

# ── Terraform targets ──────────────────────────────────────────────────────────
# Terraform manages LocalStack resources (S3, SNS, SQS) and K8s namespaces/secrets.
# Requires: Terraform installed, Kind cluster running (`make kind-create`)
# Usage:
#   make tf-localstack                    # init + apply LocalStack resources
#   make tf-k8s                          # init + apply K8s namespaces/secrets
#   make tf-all                          # apply everything

TF_DIR := $(dir $(lastword $(MAKEFILE_LIST)))terraform
AWS_ACCESS_KEY ?= test
AWS_SECRET_KEY ?= test
LOCALSTACK_ENDPOINT ?= http://localhost:4566

tf-localstack:
	cd $(TF_DIR)/localstack && terraform init && \
	cd $(TF_DIR)/localstack && terraform apply \
		-var="aws_access_key=$(AWS_ACCESS_KEY)" \
		-var="aws_secret_key=$(AWS_SECRET_KEY)" \
		-var="localstack_endpoint=$(LOCALSTACK_ENDPOINT)"

tf-k8s: apply-base
	cd $(TF_DIR)/kubernetes && terraform init && \
	cd $(TF_DIR)/kubernetes && terraform apply \
		-var="kubeconfig_path=$(KIND_KUBECONFIG)" \
		-var="jwt_secret=change-me-in-production-min-32-chars-long" \
		-var="database_password=cloudcommerce"

tf-all: tf-localstack tf-k8s
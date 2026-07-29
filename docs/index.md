# CloudCommerce Documentation

> The **second brain** for everything about this project — architecture decisions, deployment procedures, debugging guides, and service-specific quirks. All in one place, fully cross-linked.

---

## 📚 Documentation Map

```
docs/
├── index.md                 ← YOU ARE HERE — start here
│
├── deployment/
│   ├── index.md            ← Deployment guide hub
│   ├── docker-compose.md   ← Quick local run (no K8s)
│   ├── kind.md             ← Kind cluster operations
│   ├── terraform.md        ← Infrastructure as code
│   ├── ci-cd.md            ← GitHub Actions + self-hosted runner
│   └── troubleshooting.md  ← All known problems + fixes
│
├── architecture/
│   ├── index.md            ← System design overview
│   ├── kafka.md           ← Kafka KRaft, listener config, events
│   └── data-flow.md       ← Service-to-service event flow
│
└── development/
    ├── index.md            ← Local dev guide
    ├── debugging.md       ← How to debug each service
    └── services/
        ├── kafka.md       ← Kafka connectivity gotchas
        └── s3.md          ← LocalStack S3 setup for dev
```

---

## 🚀 Quick Links by Task

| Need to... | Go to |
|-----------|-------|
| Run all services locally (no K8s) | [Docker Compose →](deployment/docker-compose.md) |
| Deploy to Kind cluster | [Kind deployment →](deployment/kind.md) |
| Update infrastructure (S3, SNS, SQS) | [Terraform →](deployment/terraform.md) |
| Rebuild a service Docker image | [Kind image load →](deployment/kind.md#load-image) |
| Fix a Kafka crash loop | [Troubleshooting →](deployment/troubleshooting.md) |
| Set up the CI/CD pipeline | [CI/CD →](deployment/ci-cd.md) |
| Understand how events flow through the system | [Data Flow →](../architecture/data-flow.md) |
| Configure Kafka for a new service | [Kafka patterns →](architecture/kafka.md) |
| Debug a service locally | [Development guide →](development/index.md) |
| Add a new Kafka event | [Kafka events →](architecture/kafka.md#events) + update [`API_CONTRACTS.md`](../../API_CONTRACTS.md) |

---

## 📁 Project Root Docs

| File | Purpose |
|------|---------|
| [`README.md`](../../README.md) | Quick start — what this project is and how to run it |
| [`ROADMAP.md`](../../ROADMAP.md) | Build phases in order — what to do next |
| [`CLAUDE.md`](../../CLAUDE.md) | Instructions for Claude Code agent (for AI pair programming) |
| [`API_CONTRACTS.md`](../../API_CONTRACTS.md) | **Source of truth** for all API endpoints and Kafka events |
| [`Development Logs and Decisions.md`](../../Development%20Logs%20and%20Decisions.md) | Historical decisions, problems solved, and patterns discovered |

---

## 🔗 Cross-Reference Guide

This documentation system is intentionally interconnected. Key cross-links:

- **`API_CONTRACTS.md`** connects to [Kafka events](../architecture/kafka.md) and the [Data Flow diagram](../architecture/data-flow.md)
- **CLAUDE.md** patterns connect to this docs folder when a pattern needs deeper explanation
- **Development Logs** connects to [Troubleshooting](deployment/troubleshooting.md) for problems that recurred
- **Troubleshooting** connects to [Kind setup](deployment/kind.md) and [Kafka](architecture/kafka.md) for root-cause context
- **CI/CD** connects to [Docker Compose](deployment/docker-compose.md) for local image building reference

---

## ⚡ Quick Start (TL;DR)

**Want to just run the thing?** Do this in order:

1. Read [Docker Compose deployment](deployment/docker-compose.md) if you want local-only
2. Read [Kind cluster setup](deployment/kind.md) if you want full Kubernetes
3. Read [CI/CD setup](deployment/ci-cd.md) to automate deploying on push to main

---

## 📝 When to Update These Docs

Update this documentation system when:
- A new deployment pattern is discovered → add to [.md](troubleshooting.md)
- A service's Kafka connectivity approach changes → update [Kafka docs](architecture/kafka.md)
- A new service is added → update [ROADMAP.md](../../ROADMAP.md), [API_CONTRACTS.md](../../API_CONTRACTS.md), and [Data Flow](../architecture/data-flow.md)
- A CI/CD change is made → update [CI/CD docs](deployment/ci-cd.md)
- A root cause of a bug is found → add to [Troubleshooting](deployment/troubleshooting.md)

**Do NOT update these docs for cosmetic changes, refactors that don't affect deployment, or temporary workarounds.** Only update for intentional, lasting changes to how the system is built or deployed.
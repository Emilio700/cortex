# Cost Efficiency

> **Module:** 04-Performance | **Priority:** MEDIUM | **Version:** 1.0.0

---

## Purpose

Define how to evaluate and optimize the economic cost of technical decisions — ensuring resources are used effectively and waste is minimized.

---

## Core Rule

**Every technical decision has a cost. Performance, scalability, and architecture choices are economic decisions as much as technical ones. Always evaluate the cost implications of your recommendations.**

---

## Cost Dimensions

| Dimension | What to Evaluate |
|---|---|
| **Compute** | CPU, memory allocation vs. actual utilization |
| **Storage** | Data volume, retention policies, redundancy |
| **Network** | Data transfer between regions, services, internet egress |
| **Operations** | Human effort to build, maintain, and troubleshoot |
| **Opportunity** | What else could the team build with this time/money? |
| **Complexity** | Cognitive load, onboarding time, bug rate |

---

## Cost-Aware Architecture Decisions

### Compute

| Pattern | Cost Impact | When |
|---|---|---|
| Serverless (pay-per-use) | Low at low scale, high at high sustained load | Variable/sporadic workloads |
| Containers (always-on) | Predictable, cost-effective at steady load | Consistent workloads |
| Reserved instances | 30-50% savings vs. on-demand | Predictable, long-running workloads |
| Spot/preemptible instances | 60-90% savings | Fault-tolerant, interruptible workloads |
| Right-sizing | Often 40-60% savings | Over-provisioned resources |

### Storage

| Pattern | Cost Impact | When |
|---|---|---|
| Tiered storage (hot/cold/archive) | Up to 90% savings on old data | Age-based access patterns |
| Compression | Reduces storage and transfer costs | Compressible data (text, JSON, logs) |
| Lifecycle policies | Automatic cost management | Auto-delete/archive old data |
| Deduplication | Reduces redundant storage | Repeated data (backups, logs) |

### Network

| Pattern | Cost Impact | When |
|---|---|---|
| CDN | Reduces origin egress, improves latency | Static assets, cached content |
| Regional deployment | Reduces cross-region transfer | Multi-region user base |
| Data compression | Reduces transfer volume | API responses, large payloads |
| Batching | Fewer requests, less overhead | High-frequency small operations |

---

## Cost Optimization Principles

### 1. Pay for What You Use, Not What You Might Need

Over-provisioning for hypothetical future load is the #1 source of cloud waste.

- Right-size from the start.
- Auto-scale based on actual demand.
- Review and adjust regularly (not set-and-forget).

### 2. Optimize the Expensive Things First

Apply Pareto principle: 80% of costs come from 20% of resources. Find that 20%:

- Which service/query/endpoint consumes the most resources?
- Which resource has the lowest utilization?
- Which storage is growing fastest?

### 3. Make Cost Visible

- Tag resources with owner, project, environment.
- Set budget alerts before you need them.
- Make cost part of the definition of done.

### 4. Complexity Has a Cost

Every abstraction, every microservice, every technology added:

| Complexity Cost | Concrete Impact |
|---|---|
| New language/framework | Team must learn it, hire for it, debug it |
| New service | Deploy, monitor, secure, scale, debug it |
| New database | Backup, replicate, tune, migrate it |
| New third-party dependency | Pay for it, trust it, handle its outages |

Before adding anything, ask: "Is the value worth the complexity cost?"

---

## Cost Efficiency Checklist

```
☐ Are instances right-sized for actual usage?
☐ Is auto-scaling configured appropriately?
☐ Are idle resources stopped/terminated? (dev/staging nights and weekends)
☐ Is data tiered by access pattern? (hot/warm/cold/archive)
☐ Are CDN and caching reducing origin load?
☐ Are there data transfer costs that could be eliminated?
☐ Are reserved instances used for predictable workloads?
☐ Is logging/monitoring data volume managed (sampling, retention)?
☐ Can any managed service replace self-managed infrastructure?
☐ Are licenses/subscriptions reviewed for unused seats?
```

---

## When Cost Should Override Technical Preference

| Scenario | Action |
|---|---|
| Managed service costs 2× self-hosted but saves 10 hours/week | Use managed service |
| Microservice adds $500/month but team is 3 people | Stay monolith until needed |
| Elasticsearch cluster costs $2000/month but simple Postgres full-text search works | Use Postgres |
| Real-time features add significant infra cost with low user value | Batch/schedule instead |

---

## Dependencies

- `Optimization.md` — Performance optimization often reduces cost
- `Scalability.md` — Scalable systems are often more cost-efficient
- `02-Engineering/Architecture.md` — Architectural decisions have the largest cost impact

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-08-01 | Initial creation. Added cost dimensions, optimization principles, checklist |

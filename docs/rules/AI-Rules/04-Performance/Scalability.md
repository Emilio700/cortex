# Scalability

> **Module:** 04-Performance | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define how to design and evaluate systems that maintain performance, reliability, and cost-effectiveness as load increases — from 10 users to 10 million.

---

## Core Rule

**Design for your current scale, but don't design yourself into a corner. Every architectural decision should have a known path to 10x and 100x growth — even if you don't implement it today.**

---

## Scalability Dimensions

Scalability isn't just about users. Consider all dimensions:

| Dimension | 1x | 10x | 100x |
|---|---|---|---|
| **Users** | 100 | 1,000 | 10,000+ |
| **Requests/second** | 10 | 100 | 1,000+ |
| **Data volume** | 1 GB | 10 GB | 100 GB+ |
| **Team size** | 3 devs | 10 devs | 30+ devs |
| **Features** | 10 | 50 | 200+ |
| **Integrations** | 2 | 10 | 50+ |
| **Geographic regions** | 1 | 3 | Global |

---

## Scaling Strategies

### Vertical Scaling (Scale Up)

Make the machine bigger.

| Pros | Cons |
|---|---|
| Simple, no code changes | Hard limit on machine size |
| Consistent architecture | Single point of failure |
| Lower operational complexity | Expensive at high end |
| | Downtime during resize |

**When**: Early stage, predictable growth, simple architectures, database primaries.

### Horizontal Scaling (Scale Out)

Add more machines.

| Pros | Cons |
|---|---|
| Theoretically unlimited | Architectural complexity |
| Better fault tolerance | Data consistency challenges |
| Cost-efficient (commodity hardware) | Operational overhead |
| Rolling updates, no downtime | Network overhead |

**When**: Growing user base, unpredictable load, stateless services.

---

## The Scalability Checklist

For every design decision, ask:

### State Management
- [ ] Is this component stateless? (If yes, scaling is trivial.)
- [ ] If stateful, how is state shared/synchronized across instances?
- [ ] Is sticky session required? (Avoid if possible.)

### Data Storage
- [ ] Can the database handle the expected read/write volume?
- [ ] Is read/write splitting appropriate? (Read replicas)
- [ ] Is sharding needed? If so, what's the shard key?
- [ ] Are queries efficient at the expected data volume?

### Caching
- [ ] What data is read-mostly and can be cached?
- [ ] What's the cache invalidation strategy?
- [ ] What happens on cache miss/cache failure?

### Asynchrony
- [ ] Can work be deferred? (Queues, background jobs)
- [ ] Are timeouts and retries configured?
- [ ] Is there a dead letter queue for failed operations?

### Communication
- [ ] Are service calls resilient? (Timeouts, retries, circuit breakers)
- [ ] Is there backpressure on upstream services?
- [ ] Are connections pooled and reused?

---

## Capacity Planning

For each critical path, estimate:

```
Required capacity = Peak load × Safety factor

Where:
- Peak load = Expected peak requests/second
- Safety factor = 2x minimum (handle spikes, deploys, failures)
```

Then verify:
```
Can single instance handle > (Required capacity / Instance count)?
If an instance dies, can remaining instances handle the load?
```

---

## Scalability Anti-Patterns

| Anti-Pattern | Signal | Fix |
|---|---|---|
| Single point of failure | One component kills the system if it dies | Redundancy, failover |
| Shared-everything database | All services on one DB, one schema | Read replicas, service-specific databases |
| No backpressure | Fast producer overwhelms slow consumer | Rate limiting, queue depth limits |
| Unbounded queues | Queue grows forever on consumer failure | Dead letter queues, TTL, alerts |
| Sticky sessions | Horizontal scaling blocked by session affinity | Stateless design, distributed session store |
| God service | One service does everything | Decompose by responsibility |

---

## The 10× Test

For any architectural recommendation, ask:

> "Would this design still work at 10× the current load? What would break first?"

If you can't answer this, you haven't thought enough about scalability.

---

## Dependencies

- `Optimization.md` — Performance optimization enables scalability
- `CostEfficiency.md` — Scale has cost implications
- `02-Engineering/Architecture.md` — Scalability is an architectural property

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-08-01 | Initial creation. Added scaling strategies, capacity planning, 10x test |

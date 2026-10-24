# Optimization

> **Module:** 04-Performance | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define how to identify, analyze, and resolve performance issues — ensuring software is not just correct, but efficient.

---

## Core Rule

**Never optimize without measuring. Never guess the bottleneck. Data over intuition, always.**

---

## The Optimization Protocol

### Phase 0: Define Acceptable Performance

Before optimizing, define success:

- What is the target response time? (p50, p95, p99)
- What is the target throughput?
- What resource constraints exist? (CPU, memory, I/O, budget)

### Phase 1: Measure (Don't Guess)

1. **Profile first**: Use actual profiling tools (not print statements).
2. **Identify the bottleneck**: Find the single biggest contributor to latency/resource consumption.
3. **Reproduce reliably**: Create a benchmark that demonstrates the problem.
4. **Establish baseline**: Record current performance with exact numbers.

### Phase 2: Analyze

For the identified bottleneck, understand:

| Question | Action |
|---|---|
| Is it algorithmic? | Analyze Big-O complexity |
| Is it I/O bound? | Check database queries, network calls, file operations |
| Is it CPU bound? | Check computation, serialization, parsing |
| Is it memory bound? | Check allocations, garbage collection, leaks |
| Is it contention? | Check locks, shared resources, connection pools |

### Phase 3: Optimize

Apply optimizations in priority order:

| Priority | Optimization | Typical Impact |
|---|---|---|
| 1 | **Algorithm improvement** (O(n²) → O(n log n)) | 10x-1000x |
| 2 | **Reduce work** (eliminate unnecessary operations) | 2x-10x |
| 3 | **Caching** (avoid recomputation/refetching) | 2x-100x |
| 4 | **Batching** (combine multiple operations) | 2x-10x |
| 5 | **Connection pooling** (reuse connections) | 2x-5x |
| 6 | **Async/parallel** (overlap I/O and computation) | 2x-Nx |
| 7 | **Micro-optimizations** (inlining, bit tricks) | <10% |

### Phase 4: Verify

1. **Re-measure**: Run the same benchmark. Did it improve?
2. **No regression**: Did other metrics degrade?
3. **Is it worth it?**: Did the improvement justify the complexity added?

---

## Common Performance Anti-Patterns

| Anti-Pattern | Description | Detection | Fix |
|---|---|---|---|
| **N+1 Queries** | One query to get N items, then N queries to get related data | ORM logs, query counts | JOINs, eager loading, batch fetching |
| **SELECT *** | Fetching all columns when only 2 are needed | Query analysis | Explicit column selection |
| **Missing indexes** | Full table scans on large tables | Slow query log, EXPLAIN | Add covering indexes |
| **Chatty I/O** | Many small operations instead of few large ones | Network/disk metrics | Batch, buffer, paginate |
| **Premature pessimization** | Over-engineering for scale that doesn't exist | Unnecessary caches, queues, microservices | Simplify; YAGNI |
| **Unbounded collections** | Loading all records into memory | OOM errors, GC pressure | Pagination, streaming, cursors |
| **Synchronous blocking** | Blocking the main thread with I/O | Thread pool exhaustion | Async/await, non-blocking I/O |
| **Cache stampede** | Many concurrent requests rebuilding the same cache | Load spikes after cache expiry | Locking, stale-while-revalidate |
| **Leaky abstractions** | ORM generating terrible queries | Slow query log | Raw SQL for complex queries |

---

## Database Optimization Checklist

```
☐ Are all queries using indexes? (Check EXPLAIN plans)
☐ Are there any N+1 query patterns?
☐ Are transactions as short as possible?
☐ Is connection pooling configured correctly?
☐ Are bulk operations used where possible?
☐ Are appropriate isolation levels used?
☐ Is the query using SELECT * unnecessarily?
☐ Are there unused indexes? (They slow writes)
☐ Are statistics up to date?
```

---

## API Optimization Checklist

```
☐ Is response size minimized? (Field selection, compression)
☐ Is pagination enforced on all list endpoints?
☐ Are cache headers set appropriately? (ETag, Cache-Control)
☐ Is rate limiting in place?
☐ Are expensive operations async? (202 Accepted pattern)
☐ Is the payload format efficient? (Consider binary for large payloads)
```

---

## The Premature Optimization Trap

> "Premature optimization is the root of all evil." — Donald Knuth

This does NOT mean "don't think about performance." It means:

1. **Make it correct first** — A fast wrong answer is useless.
2. **Make it clear** — Optimized code is usually harder to read.
3. **Make it fast where it matters** — Only after measuring.

Performance consciousness ≠ premature optimization. Always write efficient code. But don't sacrifice clarity for micro-optimizations until the profiler demands it.

---

## Dependencies

- `Scalability.md` — Performance at scale
- `CostEfficiency.md` — Performance has cost implications
- `02-Engineering/CodingStandards.md` — Write efficient code by default

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-08-01 | Initial creation. Added optimization protocol, anti-patterns, checklists |

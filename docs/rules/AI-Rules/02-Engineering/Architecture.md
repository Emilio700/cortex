# Architecture

> **Module:** 02-Engineering | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define architectural principles and patterns that ensure systems are coherent, maintainable, and scalable.

---

## Core Rule

**Architecture is about defining boundaries, responsibilities, and contracts so the system can evolve without collapsing.**

---

## First Principles

1. **Separation of Concerns** — Each component has one reason to change
2. **Low Coupling, High Cohesion** — Modules depend minimally; related code lives together
3. **Dependency Rule** — Dependencies point inward: Frameworks → Controllers → Use Cases → Entities
4. **Interface Segregation** — Many small, focused interfaces over one large general one
5. **Explicit Boundaries** — Every architectural boundary should be intentional and documented

---

## Pattern Decision Guide

| Pattern | When to Use | When to Avoid |
|---|---|---|
| Monolith | Small team, early stage | Growing complexity, team scaling |
| Modular Monolith | Medium complexity, future flexibility | Already need independent scaling |
| Microservices | Multiple teams, independent scaling | Small team, no DevOps maturity |
| Event-Driven | Async workflows, multiple consumers | Simple CRUD |
| Hexagonal | Testability, domain isolation | Very simple apps |

---

## Architecture Smells

| Smell | Remedy |
|---|---|
| Rigidity — small changes cascade | Introduce abstractions, invert dependencies |
| Fragility — changes break unrelated things | Strengthen boundaries, improve test coverage |
| Needless complexity — over-engineered | Simplify; YAGNI |
| Immobility — can't extract reusable parts | Identify shared kernel |

---

## The Simplicity Imperative

Before adding any architectural element, ask:
1. What problem does this solve? (not "could solve")
2. Is the problem real today? (not "someday")
3. Is the added complexity worth it?
4. Can a simpler solution work?

---

## Dependencies

- `Philosophy.md` — Architectural principles derive from philosophical ones
- `CodingStandards.md` — Architecture constrains code
- `01-Reasoning/DecisionMaking.md` — ADR framework

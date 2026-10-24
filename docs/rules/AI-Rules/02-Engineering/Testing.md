# Testing

> **Module:** 02-Engineering | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define testing philosophy, strategy, and standards to ensure software quality is verifiable.

---

## Core Rule

**Untested code is broken code. The only acceptable evidence that software works is a passing test suite.**

---

## Testing Philosophy

### 1. Test Behavior, Not Implementation
Test WHAT the code does, not HOW. Implementation changes should not break behavior tests.

### 2. The Testing Pyramid
```
     ╱  E2E  ╲        Few: Critical user journeys
    ╱Integration╲     Some: Component interactions
   ╱    Unit      ╲   Many: Individual functions/methods
  ─────────────────
```

### 3. Test FIRST When Appropriate
For complex logic or bug fixes: write failing test → minimum code → refactor with confidence.

---

## Test Quality Standards

| Property | Description |
|---|---|
| Fast | Unit tests in ms. Suite in minutes, not hours. |
| Isolated | No test-order dependency. |
| Deterministic | Same result every time. No flakiness. |
| Readable | Arrange-Act-Assert pattern. Test name describes scenario. |
| Meaningful | Tests a behavior that matters. |

---

## What to Test

| Always | Sometimes | Rarely |
|---|---|---|
| Business logic | Configuration wiring | Trivial getters/setters |
| Validation rules | Cache behavior | Language built-ins |
| Edge cases | Logging output | Constants |
| Error handling paths | Retry logic | Generated code |
| Security rules | | |

---

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Testing mocks, not behavior | Test real behavior; mock only external boundaries |
| The ice-cream cone (many E2E, few unit) | Invert: more unit, fewer E2E |
| Flaky tests | Fix race conditions, fixed seeds |
| Slow test suite | Profile, optimize, parallelize |

---

## Coverage Philosophy

Coverage is a signal, not a goal. Target 80%+ on business logic. Don't obsess over the number — obsess over whether critical paths are tested.

---

## Dependencies

- `CodingStandards.md` — Testable code is well-structured code
- `Architecture.md` — Test strategy reflects architectural boundaries

# Decision Making

> **Module:** 01-Reasoning | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define a systematic framework for making technical decisions and evaluating trade-offs.

---

## Core Rule

**Never recommend the first solution. Generate alternatives, evaluate against explicit criteria, and justify the recommendation.**

---

## The Decision Framework

### 1. Frame
What is being decided? What constraints exist? What does success look like?

### 2. Generate Alternatives
Force at least three approaches: the obvious, the conservative, the innovative.

### 3. Evaluate
Score against criteria: Correctness, Security, Maintainability, Performance, Complexity, Cost, Time.

### 4. Decide
Recommend the best weighted outcome. State what was rejected and why.

### 5. Mitigate
Identify top 3 risks. Propose mitigation. Define rollback conditions.

---

## Anti-Patterns

| Anti-Pattern | Problem |
|---|---|
| Bikeshedding | Debating trivial details, ignoring critical decisions |
| Analysis paralysis | Never deciding |
| HIPPO-driven | Highest Paid Person's Opinion overrides evidence |
| Sunk cost | Continuing because of past investment, not future value |

---

## Dependencies

- `CriticalThinking.md` — Analysis before decision
- `Philosophy.md` — Decision heuristics

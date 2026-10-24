# Coding Standards

> **Module:** 02-Engineering | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define universal code quality standards applicable regardless of language or framework.

---

## Core Rule

**Every line of code must be clean, correct, secure, and maintainable.**

---

## Universal Code Properties

### 1. Readability
- Self-documenting names — variables, functions, classes reveal intent
- Consistent formatting — follow project style or language standard
- Minimal nesting — use early returns, guard clauses
- Explicit over implicit — magic values are bugs waiting to happen

### 2. Correctness
- Handle all states: success, failure, loading, empty, edge cases
- Validate inputs at boundaries
- Fail explicitly — silent failures become production mysteries

### 3. Modularity
- Single Responsibility — each unit does one thing well
- Clear interfaces — inputs/outputs explicit and typed
- Low coupling, high cohesion

### 4. Robustness
- Graceful degradation when dependencies fail
- Timeouts on every external call
- Retries with backoff for transient failures

### 5. Testability
- Dependency injection — dependencies passed in, not created internally
- Pure functions where possible — side effects at the edges

---

## Anti-Patterns Catalog

| Anti-Pattern | Detection | Fix |
|---|---|---|
| God function | >50 lines, many unrelated things | Extract focused functions |
| Magic numbers | Literal values without explanation | Named constants |
| Boolean trap | `func(true, false)` — unclear meaning | Enums or keyword args |
| Catch-and-swallow | `except: pass` | Log, re-raise, or handle specifically |
| Commented-out code | Dead code blocks | Delete; use git history |

---

## Language-Specific Standards

### Python
- PEP 8, type hints on public interfaces, Google-style docstrings
- `pathlib` over `os.path`, context managers for resources

### TypeScript
- `const` over `let`, strict mode, async/await over raw promises
- Runtime validation at boundaries (Zod or similar)

---

## Dependencies

- `Architecture.md` — Code exists within architectural boundaries
- `Testing.md` — Code quality is proven by tests
- `03-Security/SecurityFoundations.md` — Security is a code quality dimension

# Documentation

> **Module:** 02-Engineering | **Priority:** MEDIUM | **Version:** 1.0.0

---

## Purpose

Define when, what, and how to document — capturing knowledge without creating maintenance burdens.

---

## Core Rule

**Document why, not what. Code says what; documentation should explain why.**

---

## Documentation Hierarchy

### Level 1: Self-Documenting Code (Always Required)
Clear names, small functions, explicit types, no magic values.

### Level 2: Inline Comments (Use Sparingly)
Explain *why*, not *what*:
```python
# ✅ Good: Explains reasoning
# Retry with backoff because upstream API rate-limits at 100 req/s
time.sleep(2 ** attempt)

# ❌ Bad: Restates the code
# Increment counter by 1
counter += 1
```

### Level 3: Docstrings (Required for Public APIs)
Every public function, class, and module: purpose, args, returns, raises.

### Level 4: Project Documentation (Context-Dependent)
README.md always. ADRs for architecture decisions. Runbooks for operations.

---

## The README Standard

Every README answers:
1. What is this?
2. Why does it exist?
3. How do I get started?
4. How do I use it?
5. How do I contribute?
6. What is the license?

---

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Outdated docs | Treat docs as part of code review |
| Redundant docs (restates code) | Delete; trust the code |
| Missing context (what without why) | Add rationale, constraints, trade-offs |
| Wall of text | Structure with headers, bullets, examples |

---

## Documentation as Code
- Docs live alongside code in version control
- Docs changes go through same review process as code
- If documentation is a separate system, it will go stale

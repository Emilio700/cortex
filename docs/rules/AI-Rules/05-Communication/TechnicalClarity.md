# Technical Clarity

> **Module:** 05-Communication | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define how to communicate technical information with precision, avoiding ambiguity, and ensuring the audience can act on the information provided.

---

## Core Rule

**Technical communication must be unambiguous, verifiable, and actionable. If the reader can misinterpret your meaning, they will.**

---

## Precision Standards

### 1. Use Exact Language

| Imprecise | Precise |
|---|---|
| "The function is slow" | "The function takes 2.3s for 1000 items — O(n²) complexity" |
| "It might crash sometimes" | "It throws NullPointerException when `user.profile` is null (line 42)" |
| "Use a better algorithm" | "Replace the linear scan with a hash map lookup — O(1) instead of O(n)" |
| "Add some error handling" | "Wrap the API call in try/except, log the error, and return a 503 status" |
| "It's not secure" | "The endpoint accepts unvalidated user input in the `query` parameter, enabling SQL injection" |

### 2. Specify Scope

Always clarify what is and isn't affected:

```markdown
## Scope of This Change

**Affected:**
- `UserService.create_user()` — now validates email format
- `POST /api/users` — returns 422 for invalid emails

**Not Affected:**
- Existing users (no backfill needed)
- `PATCH /api/users` (separate validation path)
- Admin user creation (bypasses validation by design)
```

### 3. Define Terms

When using domain-specific or potentially ambiguous terms, define them:

```markdown
**Idempotency key**: A unique value provided by the client that allows
safe retry of requests. If the same key is used twice, the second
request returns the result of the first instead of executing again.
```

### 4. Version Your Advice

Specify the version context of your recommendations:

```markdown
# ✅ Good
This uses React Router v6.4+ data loaders.

# ✅ Good
For Django <4.2, use `django.conf.urls.url()`. For Django 4.2+, use `django.urls.re_path()`.

# ❌ Bad
Use React Router data loaders.  (Which version?)
```

---

## Code Communication Standards

### Explaining Code

Before showing code, explain:
1. **What** it does (purpose)
2. **Why** this approach (rationale)
3. **Where** it fits (context in the codebase)

After showing code, explain:
1. **Key decisions** made in the implementation
2. **Edge cases** handled
3. **How to use/test** the code

### Code in Responses

- Always include necessary imports.
- Show complete, runnable code — not fragments that require guesswork.
- If the code can't be complete due to size, clearly mark omissions: `# ... existing code ...`
- Prefer actual code over pseudocode unless discussing abstract concepts.
- Use syntax highlighting with language tags.

### File Paths

Always use backticks for file paths: `` `src/services/auth.py` ``

When referencing a location, be exact:
```markdown
# ✅ Good
In `src/services/auth.py`, the `validate_token` function (line 42-68)

# ❌ Bad
In the auth service
```

---

## Error Communication

When explaining an error:

```markdown
### Error
[Exact error message, stack trace key line]

### Cause
[Root cause, not just the trigger]

### Why It Happened
[The mechanism — what sequence of events led to this]

### Fix
[Step-by-step resolution]

### Prevention
[How to avoid this class of error in the future]
```

---

## Diagram Communication

When you can't draw:

- Use ASCII art for simple relationships
- Use Mermaid for flowcharts and sequence diagrams
- Describe architecture textually with clear component names
- Use tables for structured data

```
Client → Load Balancer → API Server → Database
                  ↓
              Cache (Redis)
```

---

## Audience Calibration

Adjust technical depth based on context clues:

| Signal | Adjust To |
|---|---|
| User uses precise technical terms | Full technical depth |
| User asks "how do I..." with basic concepts | Explain fundamentals |
| User references project-specific code | Use project conventions and names |
| User compares multiple technologies | Provide balanced, detailed comparison |
| User seems frustrated/stuck | Prioritize actionability over completeness |

When in doubt, provide the core at a mid-level and offer to go deeper.

---

## The "Can They Act On This?" Test

Before sending any technical communication, verify:

1. **Is every instruction complete?** (All steps, no gaps)
2. **Is every reference exact?** (File names, line numbers, API names)
3. **Are all prerequisites stated?** (Dependencies, configurations, assumptions)
4. **Is the expected outcome clear?** (What success looks like)
5. **Would a tired developer at 5 PM understand this?**

---

## Dependencies

- `WritingStyle.md` — General writing principles
- `OutputFormat.md` — Structured templates
- `02-Engineering/Documentation.md` — Documentation standards

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-08-01 | Initial creation. Added precision standards, audience calibration, actionability test |

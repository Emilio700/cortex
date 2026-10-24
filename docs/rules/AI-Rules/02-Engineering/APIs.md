# APIs

> **Module:** 02-Engineering | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define standards for designing, building, and documenting APIs — REST, GraphQL, gRPC, or internal interfaces.

---

## Core Rule

**An API is a contract. Design from the consumer's perspective, not the implementation's.**

---

## Universal Principles

### 1. Consumer-First Design
What does the consumer need? What's the simplest interface? What would confuse them?

### 2. Consistency
Same naming, same error format, same pagination, same auth everywhere.

### 3. Explicit Errors
Tell the consumer: what went wrong (code), why (message), what to do (help URL).

### 4. Versioning
Prefer backward-compatible evolution. Add, don't remove. Deprecate before deleting.

### 5. Pagination
Every list endpoint must be paginated. Cursor-based preferred over offset.

---

## REST Standards

| Method | Semantics | Idempotent |
|---|---|---|
| GET | Retrieve | Yes |
| POST | Create | No |
| PUT | Replace | Yes |
| PATCH | Partial update | Should be |
| DELETE | Remove | Yes |

### Status Codes
Use the full range: 200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503.

### URL Design
```
✅ GET /users/123/orders
❌ GET /getUserOrders?userId=123
```

---

## Internal API Design

### Function Signatures
```python
# ✅ Good: Keyword args, enums, explicit types
def search(query: str, *, case_sensitive: bool = False, sort_by: SortOrder = SortOrder.RELEVANCE) -> SearchResults

# ❌ Bad: Boolean trap, stringly-typed
def search(query, case_sensitive, sort_by)
```

### Interface Segregation
Many small, focused interfaces over one fat one. Clients depend only on what they use.

---

## API Security Checklist
- [ ] Authentication on every endpoint
- [ ] Authorization check on every operation
- [ ] Input validation on every parameter
- [ ] Rate limiting on public endpoints
- [ ] HTTPS only
- [ ] No stack traces in error responses
- [ ] Request size limits

---

## Dependencies

- `CodingStandards.md` — API code quality
- `Architecture.md` — API as architectural boundary
- `03-Security/SecurityFoundations.md` — API security

# Security Foundations

> **Module:** 03-Security | **Priority:** CRITICAL | **Version:** 1.0.0

---

## Purpose

Define the non-negotiable security principles that must be applied to every recommendation, every code review, and every architectural decision.

---

## Core Rule

**Security is not a feature. It is a property of every feature. Every line of code, every API endpoint, every architectural decision must be evaluated for its security implications.**

---

## Security-First Mindset

### Default-Deny Stance

- Assume all inputs are malicious until validated.
- Assume all requests are unauthorized until authenticated and authorized.
- Assume all data is sensitive until classified otherwise.
- Assume all dependencies have vulnerabilities until verified.

### Least Privilege

Every component, user, and process should have:
- The minimum permissions needed to function.
- For the minimum duration necessary.
- With the minimum scope required.

### Defense in Depth

No single security control is sufficient. Layer controls so that if one fails, others still protect:

```
Network → Application → Data → Monitoring
   ↓          ↓         ↓         ↓
Firewall   AuthN/Z   Encryption  Auditing
WAF        Validation Masking    Alerting
DDoS       CORS       At-rest    Forensics
```

---

## Security Evaluation Framework

For every recommendation or code change, evaluate:

### 1. Authentication (Who are you?)

- [ ] Is authentication required? If not, why not?
- [ ] Is the authentication mechanism appropriate for the sensitivity level?
- [ ] Are sessions managed securely (expiry, rotation, invalidation)?
- [ ] Is MFA enforced where needed?

### 2. Authorization (What can you do?)

- [ ] Is every operation authorization-checked?
- [ ] Is authorization checked server-side (never trust client-side checks)?
- [ ] Is the principle of least privilege applied?
- [ ] Are role/permission checks tested?

### 3. Input Validation (Is this safe?)

- [ ] Is every input validated? (type, length, format, range)
- [ ] Is validation server-side? (client-side is UX, not security)
- [ ] Is validation positive (allow list) rather than negative (block list)?
- [ ] Are file uploads validated (type, size, content)?

### 4. Output Encoding (Will this break something?)

- [ ] Is output encoded for its context? (HTML, JS, SQL, URL, etc.)
- [ ] Are content types explicitly set?
- [ ] Are security headers present? (CSP, X-Content-Type-Options, etc.)

### 5. Data Protection (Is sensitive data safe?)

- [ ] Is sensitive data encrypted at rest?
- [ ] Is data encrypted in transit (TLS 1.2+)?
- [ ] Is sensitive data logged? (It shouldn't be.)
- [ ] Is data classified and handled according to its classification?

### 6. Dependency Security (What are we relying on?)

- [ ] Are dependencies up to date?
- [ ] Are there known CVEs in the dependency tree?
- [ ] Is the dependency still maintained?
- [ ] Is the dependency necessary? (Every dependency is a liability.)

### 7. Logging & Monitoring (Would we know if we're breached?)

- [ ] Are security events logged? (auth attempts, access denials, input validation failures)
- [ ] Are logs tamper-proof?
- [ ] Are alerts configured for suspicious patterns?
- [ ] Is there an incident response plan?

---

## Common Vulnerability Classes

| Vulnerability | Detection Signal | Prevention |
|---|---|---|
| **SQL Injection** | String concatenation in queries | Parameterized queries 100% of the time |
| **XSS** | Unescaped user input in HTML | Context-aware output encoding; CSP headers |
| **CSRF** | State-changing requests without tokens | CSRF tokens; SameSite cookies |
| **SSRF** | User-controlled URLs fetched by server | Allow-list for URLs; block internal IPs |
| **IDOR** | Resource IDs in URLs without ownership check | Verify ownership on every access |
| **Path Traversal** | User input used in file paths | Canonicalize and validate paths; don't use user input for paths |
| **Command Injection** | User input in shell commands | Don't use shell; use subprocess APIs with array args |
| **Deserialization** | Untrusted data deserialized | Don't deserialize untrusted data; use safe formats (JSON) |
| **Timing Attacks** | String comparison for secrets | Constant-time comparison |
| **Mass Assignment** | Binding request body directly to model | Explicit allow-lists for bindable fields |

---

## Security in Code Review

When reviewing code, ask these questions in order:

1. **Is there any way this code could be exploited?** Be creative. Be adversarial.
2. **Does this code handle secrets correctly?** No hardcoded keys, tokens, passwords.
3. **Is user input properly validated and sanitized?** At every entry point.
4. **Are error messages leaking information?** No stack traces, no internal paths, no query details.
5. **Is this code logging sensitive data?** Passwords, tokens, PII in logs = data breach.

---

## The "Never" List

- Never hardcode secrets (API keys, passwords, tokens, certificates)
- Never trust client-side validation
- Never concatenate user input into SQL, shell commands, or HTML
- Never expose stack traces to users
- Never use deprecated cryptographic algorithms (MD5, SHA1, DES, RC4)
- Never log sensitive data
- Never disable security features for convenience
- Never commit secrets to version control

---

## Dependencies

- `ThreatModeling.md` — Systematic threat identification
- `SecretsManagement.md` — Handling credentials securely
- `02-Engineering/CodingStandards.md` — Security is a code quality dimension

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-08-01 | Initial creation. Expanded original security section with evaluation framework and vulnerability catalog |

# Threat Modeling

> **Module:** 03-Security | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define a systematic approach to identifying, categorizing, and mitigating security threats in software systems.

---

## Core Rule

**Before recommending any system design or significant feature, identify what could go wrong — intentionally (attacks) and accidentally (failures) — and address those threats explicitly.**

---

## The STRIDE Model

For every component and data flow, evaluate:

| Threat Category | Question | Example |
|---|---|---|
| **S**poofing | Can someone pretend to be someone else? | Stolen credentials, session hijacking |
| **T**ampering | Can data be modified maliciously? | Modified requests, poisoned caches |
| **R**epudiation | Can users deny their actions? | No audit log, unsigned transactions |
| **I**nformation Disclosure | Can data be exposed? | Unencrypted traffic, verbose errors, exposed APIs |
| **D**enial of Service | Can the system be overwhelmed? | No rate limiting, expensive queries |
| **E**levation of Privilege | Can users gain unauthorized access? | Missing authorization checks, role confusion |

---

## Threat Modeling Process

### Step 1: Define Scope

- What system/feature are we analyzing?
- What are the trust boundaries?
- What data flows across boundaries?

### Step 2: Diagram the System

Draw a data flow diagram showing:
- External entities (users, external services)
- Processes (components, services)
- Data stores (databases, caches, files)
- Data flows (arrows)
- Trust boundaries (dotted lines)

### Step 3: Identify Threats

For each element in the diagram, apply STRIDE. Ask:

- **External Entity → Process**: Can the entity be spoofed? Can input be tampered with?
- **Process → Data Store**: Is the query safe? Is the data protected?
- **Process → Process**: Is the communication encrypted? Is authentication mutual?
- **Data Store**: Is data encrypted? Are access controls in place? Are backups secure?

### Step 4: Assess Risk

For each threat, estimate:

| Risk = Impact × Likelihood |
|---|---|
| **Impact**: What's the damage if exploited? (Critical/High/Medium/Low) |
| **Likelihood**: How probable is exploitation? (Certain/Likely/Possible/Unlikely) |

Prioritize: Critical+Certain first. Low+Unlikely last.

### Step 5: Mitigate

For each high-priority threat, define:

1. **Prevention**: Stop it from happening (authentication, validation, encryption)
2. **Detection**: Know if it happens (monitoring, alerting, auditing)
3. **Response**: What to do if it happens (incident response plan)

### Step 6: Validate

- Did the mitigation actually address the threat?
- Did it introduce new threats?
- Is the mitigation testable?

---

## Quick Threat Assessment Prompts

When time-constrained, at minimum ask:

1. **What's the worst that could happen?** (Impact analysis)
2. **What would an attacker need to make it happen?** (Precondition analysis)
3. **Is there an obvious way to prevent it?** (Mitigation identification)
4. **Would we know if it happened?** (Detection capability)

---

## Common Threat Scenarios by Domain

### Web Applications

| Threat | Mitigation |
|---|---|
| SQL Injection | Parameterized queries |
| XSS | Output encoding, CSP |
| CSRF | Anti-CSRF tokens, SameSite cookies |
| Session hijacking | Secure, HttpOnly cookies; session rotation |
| File upload abuse | Type validation, size limits, virus scanning, isolated storage |

### APIs

| Threat | Mitigation |
|---|---|
| Unauthorized access | OAuth2/JWT with short expiry |
| Data scraping | Rate limiting, per-user quotas |
| Injection via parameters | Input validation at API gateway |
| Mass assignment | Explicit field allow-lists |
| Replay attacks | Nonce, timestamp validation |

### Data Storage

| Threat | Mitigation |
|---|---|
| Data breach | Encryption at rest, access controls, audit logging |
| Data corruption | Backups, integrity checks, write-ahead logging |
| Unauthorized access | Row-level security, least privilege DB users |
| Data exfiltration | Egress monitoring, data loss prevention |

### Cloud/Infrastructure

| Threat | Mitigation |
|---|---|
| Credential leakage | Secrets manager, no hardcoded credentials |
| Misconfigured storage | Automated compliance checks, least privilege policies |
| Container escape | Non-root users, read-only filesystems, security contexts |
| Supply chain attack | Signed images, dependency scanning, SBOM |

---

## Dependencies

- `SecurityFoundations.md` — The principles that drive threat analysis
- `SecretsManagement.md` — Specific guidance for credential threats
- `02-Engineering/Architecture.md` — Architecture diagrams feed threat models

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-08-01 | Initial creation. Added STRIDE, process, domain-specific scenarios |

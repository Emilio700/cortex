# Secrets Management

> **Module:** 03-Security | **Priority:** CRITICAL | **Version:** 1.0.0

---

## Purpose

Define how to handle credentials, API keys, tokens, certificates, and all other secrets — ensuring they never leak through code, configuration, logs, or communication.

---

## Core Rule

**A secret that touches disk, version control, logs, or an environment dump is a compromised secret. Secrets must be handled with zero-trust: assume every medium is hostile.**

---

## The Secrets Lifecycle

```
Generation → Storage → Distribution → Rotation → Revocation → Destruction
```

Every secret must have a defined and enforced lifecycle.

### 1. Generation

- Use cryptographically secure random generators.
- Secrets should be long enough for their purpose (≥128 bits for API keys, ≥256 bits for encryption keys).
- Never generate secrets from predictable inputs (timestamps, usernames, sequential IDs).

### 2. Storage

Priority order for secret storage:

| Priority | Method | Use Case |
|---|---|---|
| 1 | Dedicated secrets manager (Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) | Production, all environments |
| 2 | Environment variables injected by orchestration (K8s Secrets, CI/CD secrets) | Runtime injection, never in .env files committed to git |
| 3 | Encrypted configuration files (sops, sealed secrets) | GitOps workflows |
| ❌ | Plaintext in config files, code, or .env committed to git | NEVER |

### 3. Distribution

- Secrets are never in source code.
- Secrets are injected at runtime by the platform.
- Secrets are scoped to the minimum environment and service.
- Audit who/what accessed each secret and when.

### 4. Rotation

| Secret Type | Rotation Frequency |
|---|---|
| User passwords | On suspicion of compromise; enforce complexity |
| API keys | 90 days (automated rotation preferred) |
| Database credentials | 90 days, or on personnel changes |
| TLS certificates | 90 days (automate with Let's Encrypt/cert-manager) |
| Encryption keys | Annually, or per compliance requirements |
| Session tokens | Hours to days |

Rotation must be automated. Manual rotation doesn't happen.

### 5. Revocation

- Secrets must be revocable without system restart.
- Revocation must propagate within seconds to minutes.
- Revoked secrets must be rejected, not just flagged.

### 6. Destruction

- Destroyed secrets must be irrecoverable.
- Backups containing secrets must have the same protection as live secrets.
- Verify destruction — attempt to use the secret after destruction and confirm rejection.

---

## The "Never" List — Secrets Edition

| Never | Because |
|---|---|
| Never commit secrets to git | Git history is forever. Rotation is expensive. |
| Never hardcode secrets in source | Code is shared, copied, decompiled, leaked. |
| Never log secrets | Logs are often less protected than the secrets themselves. |
| Never send secrets in error messages | Error messages are the first thing an attacker reads. |
| Never share secrets across environments | Prod secret in staging = prod compromise. |
| Never store secrets in environment variables in `.env` files | They end up in backups, screenshots, error reports. |
| Never pass secrets as command-line arguments | Visible in `ps`, process lists, audit logs. |
| Never keep default credentials | First thing attackers try. |

---

## Detection Patterns

Red flags that should trigger immediate action:

- [ ] `password = "..."` in source code
- [ ] `api_key = "..."` in source code
- [ ] `secret = "..."` in source code
- [ ] `.env` file without being in `.gitignore`
- [ ] Connection strings with embedded credentials
- [ ] `Authorization: Bearer eyJ...` in logs
- [ ] Private keys in any file (`-----BEGIN RSA PRIVATE KEY-----`)
- [ ] Any string that looks like a token (`xoxb-`, `sk-`, `ghp_`, `AKIA`)

---

## Secrets in Different Contexts

### Development

- Use local-only secrets that have no access to production resources.
- Consider using a local secrets file excluded from git (`.env.local` in `.gitignore`).
- Use dummy/sandbox API keys for third-party services.

### CI/CD

- Secrets injected by CI/CD platform's secret store (GitHub Secrets, GitLab CI Variables).
- Masked in logs automatically by the CI/CD platform.
- Scoped to the specific pipeline/stage that needs them.
- Rotated independently of application secrets.

### Production

- Managed exclusively by a secrets manager or platform secret store.
- Never accessible via SSH or manual commands if avoidable.
- Access audit-logged.
- Automatically rotated.

---

## Dependencies

- `SecurityFoundations.md` — Overall security principles
- `ThreatModeling.md` — Identify where secrets are at risk
- `02-Engineering/CodingStandards.md` — Code standards that prevent secret leakage

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-08-01 | Initial creation. Added lifecycle, rotation schedules, detection patterns |

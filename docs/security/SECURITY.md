# Security

Status legend: ✅ implemented & tested · 🟡 implemented, more tests in later phases · ⏳ planned (phase noted)

## 1. Authentication

| Control | Status | Implementation |
|---------|:-:|----------------|
| Password hashing | ✅ | bcrypt, cost 12 (`BCRYPT_ROUNDS`), 72-byte input limit enforced by validation (no silent truncation) |
| Password policy | ✅ | ≥ 8 chars, ≤ 72 bytes, at least one letter and one digit |
| Access tokens | ✅ | JWT HS256, 15 min, `iss`/`aud` verified, algorithm pinned (rejects `none`), carries `token_version` |
| Refresh tokens | ✅ | 256-bit random, only SHA-256 hash stored, 7 days, rotated on each use; family-based reuse detection revokes the whole session (10 s grace for parallel requests) |
| Session revocation | ✅ | Logout (family), logout-all, password change/reset, deactivation → refresh tokens revoked + `token_version` bumped (access tokens die on next request) |
| Per-request user check | ✅ | Every authenticated request reloads status and permissions: deactivation and permission changes are immediate |
| Brute force | ✅ | Per-account lockout (5 failures → 15 min) + per-IP rate limits (login 10/min, forgot-password 5/h, global 300/min) |
| Enumeration resistance | ✅ | Unknown email / wrong password / locked → identical 401; dummy bcrypt compare equalises timing; forgot-password always 202 and does not await email delivery |
| Password reset | ✅ | Single-use (conditional update), 30 min expiry, hashed at rest, newest link only, clears lockout, revokes sessions |
| Self-registration | ✅ | Off by default; creates inactive STAFF accounts pending admin approval |
| Token storage in browser | ✅ | Next.js BFF server keeps tokens in `HttpOnly; SameSite=Lax` cookies (`Secure` in production); never exposed to JS; `sanitizeNextPath` prevents open redirects |

## 2. Authorization

| Control | Status | Implementation |
|---------|:-:|----------------|
| Central RBAC | ✅ | Permission catalogue in code (`common/auth/permissions.ts`), roles ↔ permissions in DB, `authorize(...)` middleware; `listRouteSecurity()` verified in unit tests (`NFR-SEC-04`) |
| Backend enforcement | ✅ | Every protected route declares a permission; UI hiding is cosmetic |
| ADMIN invariants | ✅ | System ADMIN implicitly holds all permissions; last-active-admin protection + self-demotion guard tested (`users.test.ts`) |
| Field-level restrictions | ✅ | Cost prices/valuation hidden without `products.view_cost` across products, inventory, movements, and reports |

## 3. Input & output

| Control | Status | Implementation |
|---------|:-:|----------------|
| Validation | ✅ | Zod on body/query/params; unknown keys stripped; bounded lengths; sort fields whitelisted; UUID checks on BFF image proxy routes |
| SQL injection | ✅ | Prisma query builder; raw SQL only through tagged-template `$queryRaw` (parameterised) |
| Sensitive fields | ✅ | Single `publicUserSelect` shape; tests assert hashes/counters never appear in responses |
| Error responses | ✅ | Stable codes; no stack traces or SQL in responses; frontend surfaces non-technical messages only |
| CSV export safety | ✅ | `escapeCsvCell` neutralizes spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`) on non-numeric strings |
| Uploads | ✅ | Magic-byte validation (`detectImageType`), ≤ 2 MB (`LIMIT_FILE_SIZE` → 413), random names, stored outside web root, MIME allowlisted + `nosniff` |

## 4. Transport & headers

| Control | Status | Implementation |
|---------|:-:|----------------|
| Security headers | ✅ | Backend: Helmet (CSP, HSTS, nosniff, frameguard) + `x-powered-by` disabled; Frontend: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP `frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |
| CORS | ✅ | Explicit origin allow-list (`CORS_ORIGINS`); tested |
| Body limits | ✅ | JSON 100 kB → 413 |
| TLS | ⏳ Phase 9 | Terminated at the reverse proxy; `TRUST_PROXY` configures client IP detection |
| CSRF | ✅ | API uses bearer tokens (not CSRF-able); frontend cookie mutations via Next.js Server Actions (built-in origin check) with `SameSite=Lax` cookies |

## 5. Data protection & integrity

| Control | Status | Implementation |
|---------|:-:|----------------|
| Append-only ledgers | ✅ | DB triggers block UPDATE/DELETE on `inventory_movements`, `payments`, `audit_logs`, `purchase_receipts(_items)`; tested |
| Integrity constraints | ✅ | 58 CHECK constraints (non-negative stock, totals formula, payment links…) |
| Audit trail | ✅ | Auth events now; business events per module, written in the same transaction |
| Least-privilege DB role | ⏳ Phase 9 | Production app user should not own the schema; `REVOKE UPDATE, DELETE` on ledger tables as a second layer |

## 6. Secrets & configuration

- All secrets from environment variables; validated at startup (Zod). The process refuses to start in production with the example JWT secret or without SMTP.
- `.env` is git-ignored; `.env.example` documents every variable with safe placeholders.
- Logs redact `authorization`, `cookie`, `set-cookie`, passwords and tokens (pino `redact`).

## 7. Dependencies

- Stable, maintained majors (TECHNICAL_DECISIONS version policy); security advisories override the policy.
- `npm audit --omit=dev`: **0 vulnerabilities** (2026-11-08). A `deepmerge-ts` override clears an advisory in the Prisma 6 CLI.
- Known dev-only advisory: moderate `minimatch` ReDoS inside `typescript-eslint` (lint tooling, never runs in production). Re-check on upgrades.
- CI runs `npm audit --omit=dev --audit-level=high`.

## 8. Reporting

Report suspected vulnerabilities privately to the maintainer; do not open public issues containing exploit details.

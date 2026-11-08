# Non-Functional Requirements

Targets assume the intended scale: one business, ≤ 50 concurrent users, ≤ 50k products, ≤ 1M inventory movements, single application instance (horizontal scaling noted where relevant).

## 1. Security (NFR-SEC)

| ID | Requirement | How |
|----|-------------|-----|
| NFR-SEC-01 | Passwords hashed with bcrypt (cost 12); never logged or returned. | `bcrypt` |
| NFR-SEC-02 | Access token: JWT (HS256, issuer/audience checked), 15 min, sent as `Authorization: Bearer`. Refresh token: 256-bit random opaque value, only its SHA-256 stored, 7-day lifetime, rotated on every use. Both held by the Next.js server in `HttpOnly; Secure; SameSite=Lax` cookies. | TD-06 |
| NFR-SEC-03 | CSRF: the API uses bearer tokens only (not CSRF-able); the frontend's cookie-based mutations go through Next.js Server Actions (built-in origin check) with `SameSite=Lax` cookies. | TD-06 |
| NFR-SEC-04 | Every endpoint except health, login, refresh, forgot/reset password, (optional) register and API docs requires authentication; every business endpoint declares a permission. A test enumerates routes and fails if one has no permission declaration. | central `authorize()` |
| NFR-SEC-05 | All input validated with Zod (body, params, query); unknown fields stripped; string lengths bounded; numeric ranges checked. | `validate()` middleware |
| NFR-SEC-06 | Rate limiting: auth endpoints 10 req/min/IP, forgot-password 5/hour/IP, global 300 req/min/IP. In-memory store (single instance) — swap for a shared store if scaled out. | `express-rate-limit` |
| NFR-SEC-07 | Security headers via Helmet; strict CORS allow-list from env; `x-powered-by` disabled; JSON body limit 100 kB. | `helmet`, `cors` |
| NFR-SEC-08 | Errors return a consistent envelope with a stable `code`; no stack traces, SQL or internal messages outside development. | error middleware |
| NFR-SEC-09 | SQL injection: Prisma query builder; raw SQL only via tagged-template `$queryRaw` (parameterised), never string concatenation. | code review rule |
| NFR-SEC-10 | Uploads: JPEG/PNG/WebP only, verified by magic bytes, ≤ 2 MB, random file names, stored outside the web root, served with `Content-Type` from stored metadata and `X-Content-Type-Options: nosniff`. | `multer` memory storage + checks |
| NFR-SEC-11 | Secrets only from environment variables, validated at startup (process exits on invalid config). `.env` files are git-ignored; `.env.example` documents every variable. | Zod env schema |
| NFR-SEC-12 | Logs redact `authorization`, `cookie`, `set-cookie`, `password*`, `token*` fields. | pino `redact` |
| NFR-SEC-13 | Ledgers (`inventory_movements`, `payments`, `audit_logs`, receipts) reject UPDATE/DELETE at DB level; production DB user should not own the schema. | triggers + SECURITY.md |

## 2. Data integrity & reliability (NFR-REL)

| ID | Requirement |
|----|-------------|
| NFR-REL-01 | Every multi-row business operation runs in a single database transaction (stock + movement + document + payment + audit). |
| NFR-REL-02 | Concurrency-safe stock and balance updates (row locks, conditional updates, DB constraints) — see BUSINESS_RULES §12. |
| NFR-REL-03 | Idempotency keys on retry-prone financial/stock operations. |
| NFR-REL-04 | Database constraints (FK, UNIQUE, CHECK, triggers) back up every critical invariant, so an application bug cannot persist inconsistent stock or payment data. |
| NFR-REL-05 | Centralized error handling maps Prisma/PG errors (unique, FK, check, serialization) to domain errors. |
| NFR-REL-06 | Graceful shutdown on SIGTERM/SIGINT: stop accepting connections, finish in-flight requests (10 s timeout), disconnect Prisma. |
| NFR-REL-07 | Health endpoints: `GET /health/live` (process up) and `GET /health/ready` (DB reachable). |
| NFR-REL-08 | Schema changes only via versioned Prisma migrations; production uses `prisma migrate deploy`. |
| NFR-REL-09 | Backup & restore procedure documented and tested (pg_dump / pg_restore). |

## 3. Performance (NFR-PERF)

| ID | Requirement |
|----|-------------|
| NFR-PERF-01 | p95 < 300 ms for list/detail endpoints and < 500 ms for transactional writes at the target scale (local Docker baseline). |
| NFR-PERF-02 | All list endpoints paginated (default 20, max 100); total counts provided. |
| NFR-PERF-03 | Indexes on every FK, status/date filter columns and trigram GIN indexes for name/SKU search (see DATABASE_DESIGN §5). |
| NFR-PERF-04 | No N+1 queries: list endpoints use `include/select` or single aggregate queries; reports use SQL `GROUP BY`. |
| NFR-PERF-05 | Dashboard and reports computed with aggregate queries (no loading rows into memory to sum them). |
| NFR-PERF-06 | Denormalised aggregates (stock, paid/refunded/returned amounts, received quantity) avoid recomputing balances on every list request; each has a single writer (DATABASE_DESIGN §6). |

## 4. Maintainability (NFR-MAINT)

| ID | Requirement |
|----|-------------|
| NFR-MAINT-01 | Modular monolith organised by domain module (routes → controller → service → data access); business logic lives in services and pure calculation functions, not in routes or React components. |
| NFR-MAINT-02 | Strict TypeScript (`strict`, `noUncheckedIndexedAccess`); ESLint + Prettier; CI fails on lint/type errors. |
| NFR-MAINT-03 | Shared calculation logic (pricing, payment status, return credit, WAC) as pure, unit-tested functions. |
| NFR-MAINT-04 | Schema, migrations, ERD, OpenAPI and docs updated in the same change as the code they describe. ERD is generated from the Prisma schema. |
| NFR-MAINT-05 | Minimal dependencies; each non-trivial dependency justified in TECHNICAL_DECISIONS. |

## 5. Observability (NFR-OBS)

| ID | Requirement |
|----|-------------|
| NFR-OBS-01 | Structured JSON logs (pino) with level, timestamp, request id, user id, method, path, status, duration. Pretty output only in development. |
| NFR-OBS-02 | Every response carries `X-Request-Id` (accepted from the client if valid, otherwise generated); errors include it so users can report it. |
| NFR-OBS-03 | Audit trail for business actions (FR-AUD). |

## 6. Usability & accessibility (NFR-UX)

| ID | Requirement |
|----|-------------|
| NFR-UX-01 | Responsive layout from 360 px (mobile, collapsible sidebar) to desktop. |
| NFR-UX-02 | Every data view has loading, empty and error states; every mutation gives success/error feedback (toast). |
| NFR-UX-03 | Destructive / irreversible actions (cancel, archive, delete, reverse, adjust) require a confirmation dialog stating the effect. |
| NFR-UX-04 | Forms validate client-side (same constraints as the API) and show server validation errors per field. |
| NFR-UX-05 | WCAG 2.1 AA basics: labelled controls, keyboard navigation, visible focus, sufficient contrast (shadcn/ui + Radix primitives). |
| NFR-UX-06 | Money, dates and numbers formatted with the business currency, locale and timezone (`Intl` APIs); no hard-coded currency. |
| NFR-UX-07 | Navigation and actions are permission-aware (hidden or disabled with explanation). |

## 7. Portability & deployment (NFR-DEP)

| ID | Requirement |
|----|-------------|
| NFR-DEP-01 | Backend and frontend each have a multi-stage Dockerfile running as non-root. |
| NFR-DEP-02 | `docker compose up` starts PostgreSQL, backend, frontend and Mailpit for local development; a production compose file is provided. |
| NFR-DEP-03 | CI (GitHub Actions): install, lint, typecheck, unit + integration tests against a PostgreSQL service, build, Playwright E2E. |
| NFR-DEP-04 | Configuration is 12-factor (env vars only). |

## 8. Testing (NFR-TEST)

| ID | Requirement |
|----|-------------|
| NFR-TEST-01 | Unit tests for all calculation and permission logic. |
| NFR-TEST-02 | Integration tests run against a real PostgreSQL (not mocks) because locking and constraints are part of the behaviour under test. |
| NFR-TEST-03 | The 8 critical scenarios from the brief (concurrent last-unit orders, repeated confirm/cancel/receive, concurrent payments, over-return, unauthorized operations, rollback) have dedicated tests. |
| NFR-TEST-04 | Playwright covers the end-to-end purchase → receive → sell → pay → complete → return → verify stock and reports workflow. |

# Testing Strategy

## 1. Layers

| Layer | Tool | Scope | Database |
|-------|------|-------|----------|
| Unit | Vitest | Pure logic: calculations (pricing, tax, discount allocation, payment status, return credit, WAC), permission matrix, query builder, token/password utilities, error mapping | none |
| Integration | Vitest + Supertest | HTTP → service → PostgreSQL: auth, RBAC, every module's endpoints, business rules, DB constraints | real PostgreSQL (`inventory_test`) |
| Critical scenarios | Vitest + Supertest | Concurrency, idempotency, rollback (see §4) | real PostgreSQL |
| End-to-end | Playwright | Browser workflows through the real frontend + backend (Phase 8) | real PostgreSQL |

Why a real database for integration tests: row locks, CHECK constraints, unique indexes and triggers *are* the behaviour under test; mocks would hide precisely the bugs that matter (TD-21).

## 2. Running tests

```bash
docker compose up -d postgres        # once
cd backend
npm test                              # unit + integration
npm run test:unit                     # no database needed
npm run test:integration
npx vitest run --coverage
```

- Integration global setup applies migrations to `DATABASE_URL_TEST` (default `postgresql://inventory:inventory@localhost:5433/inventory_test`) and **refuses to run if the database name does not contain "test"**.
- Each test (or file) calls `resetDatabase()`: `TRUNCATE … RESTART IDENTITY CASCADE` on every table, then the base seed. TRUNCATE intentionally bypasses the append-only row triggers.
- Integration files run sequentially (shared database); tests inside a file run in order.
- Test env: bcrypt cost 4, rate limiting off (the rate-limit suite enables it in its own module graph), logger silent, emails captured in memory (`sentMessages`).

## 3. Conventions

- Assert behaviour and data, not just status codes: check DB rows (movements, balances, audit entries), error `code`s and that nothing changed on failure.
- Every business rule `BR-…` and requirement `FR-…` with logic gets at least one test; test names describe the rule.
- Factories create only what a test needs (`createUser`, later `createProduct`, `createPurchase`, …).
- No test depends on another test's data.

## 4. Critical scenarios (required by the brief)

| # | Scenario | Phase | Status |
|---|----------|-------|--------|
| 1 | Two concurrent orders for the last unit: exactly one confirms, stock = 0, one SALE movement | 5 | ⏳ |
| 2 | Repeated order confirmation: second → 409, stock deducted once | 5 | ⏳ |
| 3 | Repeated cancellation: stock restored once | 5 | ⏳ |
| 4 | Repeated / concurrent purchase receiving with same key and with different keys exceeding remaining qty | 4 | ⏳ |
| 5 | Concurrent payments exceeding the balance: total paid never exceeds due | 5 | ⏳ |
| 6 | Returning more than sold minus previous returns (incl. pending) | 6 | ⏳ |
| 7 | Unauthorized users attempting restricted operations | 2+ | ✅ (auth/RBAC); extended per module |
| 8 | Transaction rollback when part of an operation fails (e.g. second line short of stock → no partial deduction, no movements, no audit) | 5 | ⏳ |

Concurrency tests fire real parallel HTTP requests (`Promise.all`) against the app; the Prisma connection pool allows true parallel transactions.

## 5. Current status (2026-11-08)

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Unit | 4 | 39 | ✅ pass |
| Integration | 4 | 38 | ✅ pass |
| **Total** | **8** | **77** | ✅ |

Covered so far: list query builder, permission matrix, password policy (incl. 72-byte limit), JWT verification (tamper/expiry/`none`), DB error mapping, login + lockout + enumeration resistance, refresh rotation and reuse detection (incl. grace window and family revocation), logout/logout-all, profile, change/reset password, self-registration, RBAC enforcement and live permission changes, error envelope, security headers, CORS, request ids, audit-log immutability, rate limiting, OpenAPI ↔ route coverage.

## 6. CI

GitHub Actions (`.github/workflows/ci.yml`): PostgreSQL 16 service → `npm ci` → lint → typecheck → unit + integration tests → build → production dependency audit. Playwright E2E is added in Phase 8.

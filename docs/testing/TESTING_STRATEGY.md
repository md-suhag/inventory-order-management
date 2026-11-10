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
# Backend (PostgreSQL required for integration tests)
docker compose up -d postgres        # once
cd backend
npm test                              # unit + integration
npm run test:unit                     # no database needed
npm run test:integration
npx vitest run --coverage

# Frontend unit & component tests (no backend/database needed)
cd frontend
npm test

# End-to-end tests (requires backend on :4000, frontend on :3000, and Chromium installed via `npx playwright install chromium`)
cd frontend
npm run test:e2e
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
| 1 | Two concurrent orders for the last unit: exactly one confirms, stock = 0, one SALE movement | 8 | ✅ (`tests/integration/critical-scenarios.test.ts`) |
| 2 | Repeated order confirmation: second → 409, stock deducted once | 8 | ✅ (`tests/integration/critical-scenarios.test.ts`) |
| 3 | Repeated cancellation: stock restored once | 8 | ✅ (`tests/integration/critical-scenarios.test.ts`) |
| 4 | Repeated / concurrent purchase receiving with same key and with different keys exceeding remaining qty | 8 | ✅ (`tests/integration/critical-scenarios.test.ts`) |
| 5 | Concurrent payments exceeding the balance: total paid never exceeds due | 8 | ✅ (`tests/integration/critical-scenarios.test.ts`) |
| 6 | Returning more than sold minus previous returns (incl. pending) & concurrent return completion | 8 | ✅ (`tests/integration/critical-scenarios.test.ts`) |
| 7 | Unauthorized users attempting restricted operations | 2, 8 | ✅ (`rbac.test.ts`, `critical-scenarios.test.ts`) |
| 8 | Transaction rollback when part of an operation fails (e.g. second line short of stock → no partial deduction, no movements, no audit) | 8 | ✅ (`tests/integration/critical-scenarios.test.ts`) |

Concurrency tests fire real parallel HTTP requests (`Promise.all`) against the app; the Prisma connection pool allows true parallel transactions.

## 5. Coverage summary (2026-11-10)

- **Backend unit tests (`backend/tests/unit`):** list query builder, permission matrix + route-level auth/RBAC enumeration (`NFR-SEC-04`), password policy (incl. 72-byte limit), JWT verification (`none`/expiry/tampering), DB error mapping, document discount/tax calculations, weighted-average cost & stock state, payment status (`BR-PAY-03..06`), and return line credit proration/rounding (`BR-RET-04`).
- **Backend integration tests (`backend/tests/integration`):** auth, RBAC, platform/OpenAPI coverage, product images, rate limiting, every business module (Phases 2–6), and all 8 concurrent/rollback critical scenarios (`critical-scenarios.test.ts`).
- **Frontend unit/component tests (`frontend/tests/unit`):** money/cost/date formatting, document preview math, open-redirect guard, CSV formula-injection neutralization, UUID/MIME guards, permission nav filtering, JWT expiration helpers, Zod schemas, and shared UI/auth components.
- **Playwright E2E (`frontend/e2e/workflow.spec.ts`):** unauthenticated redirect & login error feedback, plus full end-to-end flow (login → product → supplier → purchase → receive stock → customer order → confirm → payment → complete → invoice → sales return & restock → verify inventory & reports).

## 6. CI

GitHub Actions (`.github/workflows/ci.yml`):
- `backend`: PostgreSQL 16 service → `npm ci` → `prisma generate` → lint → typecheck → unit + integration tests → build → production dependency audit.
- `frontend`: `npm ci` → lint → typecheck → unit/component tests → build → production dependency audit (Playwright browser E2E runs manually or in Phase 9 full-stack CI).

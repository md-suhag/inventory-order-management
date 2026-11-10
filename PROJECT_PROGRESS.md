# Project Progress

_Last updated: 2026-11-10_

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 · Inspection & requirements | ✅ Approved 2026-11-08 | Requirements, NFRs, business rules |
| 1 · Architecture & database design | ✅ Approved 2026-11-08 | Schema, constraints, migration, ERD (5 pages + exports); review decisions applied |
| 2 · Backend foundation | ✅ Complete 2026-11-08 | Config, logging, errors, validation, query builder, auth, RBAC, health, Swagger, tests, CI |
| 3 · Core business modules | ✅ Approved & merged 2026-11-09 | Users, roles, categories, products (+ images), suppliers, customers, dashboard foundation |
| 4 · Purchase & inventory | ✅ Approved & merged 2026-11-09 | Purchases, goods receipts, inventory management & adjustments, movements |
| 5 · Orders & payments | ✅ Approved & merged 2026-11-10 | Orders, invoices, payments, refunds, balances |
| 6 · Returns, reports, audit, settings | ⏳ | |
| 7 · Frontend | ⏳ | |
| 8 · Testing & hardening | ⏳ | |
| 9 · Deployment preparation | ⏳ | |
| 10 · Final review | ⏳ | |

## Modules

| Module | DB design | Backend | Frontend | Tests |
|--------|:-:|:-:|:-:|:-:|
| Auth & accounts | ✅ | ✅ | – | ✅ |
| Users & RBAC | ✅ | ✅ user admin API (last-admin guard, BR-USER-02..07), role CRUD + permission editing | – | ✅ |
| Dashboard | ✅ | ✅ summary: counts, orders by status, low/out of stock, recent orders/purchases, inventory value + outstanding balances | – | ✅ |
| Products | ✅ | ✅ CRUD, opening stock via inventory service, stock-state filters, cost visibility, images | – | ✅ |
| Categories | ✅ | ✅ CRUD, archive/unarchive, delete only when unused | – | ✅ |
| Suppliers | ✅ | ✅ CRUD, archive, safe delete, balance summary | – | ✅ |
| Customers | ✅ | ✅ CRUD, archive, safe delete, balance summary | – | ✅ |
| Purchases & receiving | ✅ | ✅ CRUD, confirm (`DRAFT` → `ORDERED`), cancel, atomic goods receipt with WAC blending, idempotency replay, receipt listing | – | ✅ |
| Inventory | ✅ | ✅ overview with stock state & cost privacy gating, low-stock query, manual adjustments (`ADJUSTMENT_IN`/`OUT`), movement history & details | – | ✅ |
| Orders & invoices | ✅ | ✅ CRUD, calculations, confirmation (stock deduction), cancellation, shipping, delivery, completion, printable invoice | – | ✅ |
| Payments | ✅ | ✅ ledger, payments on orders, refunds, reversals, idempotency replay, balance updates | – | ✅ |
| Sales returns | ✅ | – | – | – |
| Reports | ✅ | – | – | – |
| Audit logs | ✅ | 🟡 recorder + immutability; read API in Phase 6 | – | 🟡 |
| Business settings | ✅ | 🟡 seeded row; API in Phase 6 | – | – |

## Next steps (handoff — start here)

Any agent/developer continuing the work: read `AGENTS.md` first, then:

1. Create branch `phase-6/returns-reports-audit-settings` for Phase 6.
2. Implement Sales returns: return authorization, return receipt (stock restoration), credit note, order refund link.
3. Implement Reports module: inventory valuation, low stock, stock movement ledger, sales summary, payment summary.
4. Implement Audit log read API and business settings management API.
5. Integration tests, OpenAPI & API_DESIGN update, check lint + typecheck + tests.
6. Owner review of Phase 6, merge to `main`.

## Phase 2 deliverables

- `backend/` package (Express 5, TypeScript 5.9, Prisma 6.19, Zod 4) with strict TS, ESLint, Prettier.
- Zod-validated env with production guards; pino logging with redaction and request ids.
- Error model with stable codes; Prisma/PostgreSQL error mapping; deadlock-retrying `withTransaction`.
- Typed request validation (`handler`), custom list query builder (pagination, search incl. relations, whitelisted multi-sort, filters).
- Security middleware: helmet, CORS allow-list, rate limits, idempotency-key requirement.
- Auth: login (bcrypt, lockout, timing equalisation), refresh rotation + reuse detection, logout/logout-all, profile, change/reset password, optional self-registration.
- RBAC: permission catalogue, `authenticate`/`authorize`, live permission changes, ADMIN implicit full access.
- Audit recorder (same-transaction), health endpoints, Swagger UI, graceful shutdown.
- Idempotent seed (permissions, roles, settings, sequences, payment methods, admin).
- Docker Compose (PostgreSQL 16 + Mailpit), GitHub Actions CI.
- Docs: API_DESIGN.md, openapi.yaml, SECURITY.md, TESTING_STRATEGY.md, README.md.

## Key technical decisions (full list: docs/architecture/TECHNICAL_DECISIONS.md)

- Stable-version policy (TS 5.9, Prisma 6.19, Next.js 15, Vitest 4, PostgreSQL 16); security fixes override it (nodemailer 10).
- Modular monolith; the Next.js server is the API client and keeps tokens in HttpOnly cookies (BFF); Next.js native fetching, no TanStack Query.
- bcrypt password hashing; hand-written OpenAPI with a route-coverage test.
- Stock deducted at order confirmation with row locks + DB CHECK backstop; append-only ledgers enforced by triggers.
- Single payment ledger (PAYMENT/REFUND/REVERSAL); weighted-average cost; per-entity idempotency keys; gap-free document numbers.

## Git

| Branch | Content |
|--------|---------|
| `main` | Phase 0–5 complete |
| `phase-6/returns-reports-audit-settings` | Phase 6 (next) |

Commits are made per completed task (docs, scaffold, foundation/auth, tests, docs/CI).

## Known issues / notes

- Dev-only moderate advisory in `typescript-eslint` → `minimatch` (lint tooling only). Production audit: 0 vulnerabilities.
- Rate limiting uses an in-memory store (single instance by design, TD-24).
- Phase 3 decisions: customers hard-delete allowed only while unreferenced (under `customers.archive`); setting `costPrice` requires `products.view_cost`; product stock states are IN_STOCK / LOW / OUT (mutually exclusive). Product images stored under `UPLOAD_DIR` (`multer` 2 added).
- GitHub remote `origin` configured; CI runs on GitHub Actions (lockfile synced with npm 10 for `npm ci`).

## Test status

| Suite | Tests | Result |
|-------|-------|--------|
| Unit | 58 | ✅ |
| Integration (PostgreSQL 16) | 135 | ✅ (Phase 1–5: 193 total across unit + integration) |
| DB constraint checks (Phase 1, manual SQL) | 22 | ✅ |
| E2E | – | Phase 8 |

## Documentation status

| Document | Status |
|----------|--------|
| requirements/* (4) | ✅ |
| architecture/* (3) | ✅ updated with review decisions |
| database/DATABASE_DESIGN.md, diagrams/* | ✅ |
| api/API_DESIGN.md, api/openapi.yaml | ✅ auth/health/roles; extended per module |
| security/SECURITY.md | ✅ Phase 2 controls |
| testing/TESTING_STRATEGY.md | ✅ |
| deployment/DEPLOYMENT.md | ⏳ Phase 9 |
| README.md | ✅ setup; deployment section in Phase 9 |

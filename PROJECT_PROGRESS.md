# Project Progress

_Last updated: 2026-11-08_

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 · Inspection & requirements | ✅ Approved 2026-11-08 | Requirements, NFRs, business rules |
| 1 · Architecture & database design | ✅ Approved 2026-11-08 | Schema, constraints, migration, ERD (5 pages + exports); review decisions applied |
| 2 · Backend foundation | ✅ Complete 2026-11-08 | Config, logging, errors, validation, query builder, auth, RBAC, health, Swagger, tests, CI |
| 3 · Core business modules | ⏳ Next | Users, roles, categories, products (+ images), suppliers, customers, dashboard foundation |
| 4 · Purchase & inventory | ⏳ | |
| 5 · Orders & payments | ⏳ | |
| 6 · Returns, reports, audit, settings | ⏳ | |
| 7 · Frontend | ⏳ | |
| 8 · Testing & hardening | ⏳ | |
| 9 · Deployment preparation | ⏳ | |
| 10 · Final review | ⏳ | |

## Modules

| Module | DB design | Backend | Frontend | Tests |
|--------|:-:|:-:|:-:|:-:|
| Auth & accounts | ✅ | ✅ | – | ✅ |
| Users & RBAC | ✅ | 🟡 RBAC middleware, permission catalogue, seeded roles; user/role CRUD in Phase 3 | – | 🟡 |
| Dashboard | ✅ | – | – | – |
| Products | ✅ | – | – | – |
| Categories | ✅ | – | – | – |
| Suppliers | ✅ | – | – | – |
| Customers | ✅ | – | – | – |
| Purchases & receiving | ✅ | – | – | – |
| Inventory | ✅ | – | – | – |
| Orders & invoices | ✅ | – | – | – |
| Payments | ✅ | – | – | – |
| Sales returns | ✅ | – | – | – |
| Reports | ✅ | – | – | – |
| Audit logs | ✅ | 🟡 recorder + immutability; read API in Phase 6 | – | 🟡 |
| Business settings | ✅ | 🟡 seeded row; API in Phase 6 | – | – |

## Next steps (handoff — start here)

Any agent/developer continuing the work: read `AGENTS.md` first, then:

1. Create branch `phase-3/core-modules`.
2. Users & roles: user CRUD/list (query builder), activate/deactivate, role assignment with **last-active-admin protection** (advisory lock, BR-USER-02), self-change restrictions (BR-USER-03), session revocation on deactivate/role change (BR-USER-04); role CRUD + permission editing (ADMIN immutable).
3. Categories, products (+ images, opening stock via inventory movement, cost hidden without `products.view_cost`), suppliers, customers — each with list/search/sort/filter, archive rules, audit logs.
4. Dashboard foundation (counts, low stock, recent activity — financial tiles once orders/purchases exist).
5. For every module: tests, `openapi.yaml` + `API_DESIGN.md`, commit per task, update this file.

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
| `main` | Phase 0–2 (merged) — not yet pushed to any remote |

Commits are made per completed task (docs, scaffold, foundation/auth, tests, docs/CI).

## Known issues / notes

- Dev-only moderate advisory in `typescript-eslint` → `minimatch` (lint tooling only). Production audit: 0 vulnerabilities.
- Rate limiting uses an in-memory store (single instance by design, TD-24).
- CI workflow is written but has not run yet (no GitHub remote configured).

## Test status

| Suite | Tests | Result |
|-------|-------|--------|
| Unit | 39 | ✅ |
| Integration (PostgreSQL 16) | 38 | ✅ |
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

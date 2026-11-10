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
| 6 · Returns, reports, audit, settings | ✅ Approved & merged 2026-11-10 | Sales returns, reports & analytics, audit log API, business settings API, tests, OpenAPI docs |
| 7 · Frontend | ✅ Approved & merged 2026-11-10 | Next.js 16.4.6 BFF (HttpOnly cookies, `proxy.ts` refresh), React 19, Tailwind 4, shadcn/ui, all 15 module UIs connected to `/api/v1` |
| 8 · Testing & hardening | ✅ Approved & merged 2026-11-10 | Critical concurrency/idempotency/rollback integration tests, payment/return/route-security unit tests, frontend Vitest + Testing Library suite, Playwright E2E workflow, backend lock/idempotency fixes, frontend security headers & CSV/open-redirect hardening |
| 9 · Deployment preparation | ✅ Approved & merged 2026-11-10 | Multi-stage non-root Dockerfiles (`backend/Dockerfile`, `frontend/Dockerfile`), `docker-compose.prod.yml` + fullstack dev profile, `.env.prod.example`, least-privilege DB role SQL (`scripts/db/harden-app-role.sql`), backup/restore scripts, `DEPLOYMENT.md`, README & CI Docker verification |
| 10 · Final review | ✅ Approved & merged 2026-11-10 | Cross-cutting audit (`docs/FINAL_REVIEW.md`), completed supplier payments (`POST/GET /purchases/:id/payments`, `POST /purchases/:id/refunds`, UI + integration & E2E tests), synced ERD SVG/PNG exports, fixed minor doc drift |

## Modules

| Module | DB design | Backend | Frontend | Tests |
|--------|:-:|:-:|:-:|:-:|
| Auth & accounts | ✅ | ✅ | ✅ login, register, forgot/reset password, profile, change password, logout-all | ✅ |
| Users & RBAC | ✅ | ✅ user admin API (last-admin guard, BR-USER-02..07), role CRUD + permission editing | ✅ user CRUD/activation, role CRUD + module permission matrix | ✅ |
| Dashboard | ✅ | ✅ summary: counts, orders by status, low/out of stock, recent orders/purchases, inventory value + outstanding balances | ✅ operational & financial KPIs, sales chart, low-stock & recent activity | ✅ |
| Products | ✅ | ✅ CRUD, opening stock via inventory service, stock-state filters, cost visibility, images | ✅ list/filters, create/edit, cost gating, image upload/reorder/delete via BFF | ✅ |
| Categories | ✅ | ✅ CRUD, archive/unarchive, delete only when unused | ✅ list/search/sort, create/edit, archive/unarchive/delete | ✅ |
| Suppliers | ✅ | ✅ CRUD, archive, safe delete, balance summary | ✅ list/search, detail w/ balance summary & purchase history, archive/delete | ✅ |
| Customers | ✅ | ✅ CRUD, archive, safe delete, balance summary | ✅ list/search, detail w/ balance summary & order history, archive/delete | ✅ |
| Purchases & receiving | ✅ | ✅ CRUD, confirm (`DRAFT` → `ORDERED`), cancel, atomic goods receipt with WAC blending, idempotency replay, receipt listing | ✅ list/filters, draft editor, confirm/cancel, partial/full GRN receiving w/ idempotency | ✅ |
| Inventory | ✅ | ✅ overview with stock state & cost privacy gating, low-stock query, manual adjustments (`ADJUSTMENT_IN`/`OUT`), movement history & details | ✅ overview/low-stock banner, manual adjustments w/ idempotency, movement ledger & detail | ✅ |
| Orders & invoices | ✅ | ✅ CRUD, calculations, confirmation (stock deduction), cancellation, shipping, delivery, completion, printable invoice | ✅ list/filters, draft editor (walk-in + discounts), lifecycle actions, printable invoice | ✅ |
| Payments | ✅ | ✅ ledger, payments on orders, refunds, reversals, idempotency replay, balance updates | ✅ global ledger, order payment/refund modals, reversals w/ reason + idempotency | ✅ |
| Sales returns | ✅ | ✅ requests against delivered/completed orders, qty validation, RESALABLE restock (`SALE_RETURN`), return-linked refunds (`salesReturnId`), rejection | ✅ list, new return qty calculator, complete/reject, linked refund modal | ✅ |
| Reports | ✅ | ✅ sales (summary, by product w/ cost gating, by customer), purchases, inventory (summary, WAC valuation), financial (summary, AR/AP aging) | ✅ tabbed analytics, charts, AR/AP aging, CSV export on all tables | ✅ |
| Audit logs | ✅ | ✅ paginated search/filter (`actorId`, `action`, `entityType`, `entityId`, date range), detail endpoint, immutable ledger | ✅ searchable/filterable ledger + JSON metadata inspector | ✅ |
| Business settings | ✅ | ✅ singleton `GET`/`PATCH`/`PUT`, currency lock after transactions, sequence prefix/padding, payment method config | ✅ profile, localization, tax/alerts, document sequences, payment methods | ✅ |

## Next steps (handoff — start here)

All project phases (**Phase 0–10**) are complete and merged into `main` (see `docs/FINAL_REVIEW.md`). MVP is ready for deployment/release.

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

- Stable-version policy (TS 5.9, Prisma 6.19, Next.js 16.4.6 [upgraded from 15.5.29 for security audit], Vitest 4, PostgreSQL 16); security fixes override it (nodemailer 10, Next.js 16.4.6).
- Modular monolith; the Next.js server is the API client and keeps tokens in HttpOnly cookies (BFF); Next.js native fetching, no TanStack Query.
- bcrypt password hashing; hand-written OpenAPI with a route-coverage test.
- Stock deducted at order confirmation with row locks + DB CHECK backstop; append-only ledgers enforced by triggers.
- Single payment ledger (PAYMENT/REFUND/REVERSAL); weighted-average cost; per-entity idempotency keys; gap-free document numbers.

## Git

| Branch | Content |
|--------|---------|
| `main` | Phase 0–10 complete (MVP ready) |
| `phase-10/final-review` | Merged into `main` |

Commits are made per completed task (docs, scaffold, foundation/auth, tests, docs/CI).

## Known issues / notes

- Dev-only moderate advisory in `typescript-eslint` → `minimatch` (lint tooling only). Production audit: 0 vulnerabilities.
- Rate limiting uses an in-memory store (single instance by design, TD-24).
- Phase 3 decisions: customers hard-delete allowed only while unreferenced (under `customers.archive`); setting `costPrice` requires `products.view_cost`; product stock states are IN_STOCK / LOW / OUT (mutually exclusive). Product images stored under `UPLOAD_DIR` (`multer` 2 added).
- GitHub remote `origin` configured; CI runs on GitHub Actions (lockfile synced with npm 10 for `npm ci`).

## Test status

| Suite | Tests | Result |
|-------|-------|--------|
| Backend Unit (`tests/unit`) | 7 files | ✅ Passed (part of 28-file / 230-test Vitest run) |
| Backend Integration (`tests/integration`, PostgreSQL 16) | 21 files (incl. `critical-scenarios.test.ts` & supplier payments) | ✅ Passed (all 28 files / 230 tests passed in Phase 10) |
| Frontend Unit & Component (`frontend/tests/unit`, Vitest) | 4 files / 18 tests (`format`, `security-and-csv`, `permissions-and-cookies`, `components`) | ✅ Passed + `lint`/`typecheck`/`next build` clean |
| DB constraint checks (Phase 1, manual SQL) | 22 | ✅ |
| E2E (`frontend/e2e/workflow.spec.ts`, Playwright) | 2 specs (auth guard + full lifecycle incl. supplier payment) | ✅ Passed (2/2 in Chromium, `12.2s`) |

## Documentation status

| Document | Status |
|----------|--------|
| requirements/* (4) | ✅ |
| architecture/* (3) | ✅ updated through Phase 10 (`proxy.ts`, `sales-returns/`, `/payments/:id/reverse`) |
| database/DATABASE_DESIGN.md, diagrams/* | ✅ synced with `20261109120000_order_fulfillment`; SVG/PNG re-exported |
| api/API_DESIGN.md, api/openapi.yaml | ✅ 81 paths / 112 operations (100% route parity verified) |
| security/SECURITY.md | ✅ updated for Phases 7–9 controls |
| testing/TESTING_STRATEGY.md | ✅ updated with Phase 8 critical scenarios, frontend Vitest & Playwright |
| deployment/DEPLOYMENT.md | ✅ |
| docs/FINAL_REVIEW.md | ✅ Phase 10 final review & completion checklist |
| README.md | ✅ setup, scripts, deployment, and Phase 10 completion links |

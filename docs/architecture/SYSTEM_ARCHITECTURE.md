# System Architecture

## 1. Overview

A **modular monolith**: one Express API (TypeScript) organised by business domain, one PostgreSQL database, and a Next.js frontend. The frontend calls the API through its own origin (Next.js rewrite of `/api/*`), so the refresh cookie is first-party and CORS stays strict.

Diagram source: [system-architecture.mmd](system-architecture.mmd). Order/payment/return flow: [../diagrams/order-flow.mmd](../diagrams/order-flow.mmd).

```
Browser ──HTTPS──► Next.js (frontend, :3000)
                     │  /api/*  (rewrite / reverse proxy)
                     ▼
                  Express API (backend, :4000) ──► PostgreSQL 15+ (:5432)
                     │                         └─► uploads volume (product images)
                     └─► SMTP (Mailpit in dev) for password-reset email
```

No Redis, queues or extra services: the workload (single business, tens of users) does not need them, and every critical invariant is enforced in PostgreSQL.

## 2. Repository layout

```
inventory-order-management/
├── backend/                 Express API, Prisma schema & migrations, tests
├── frontend/                Next.js app
├── docs/                    requirements, architecture, database, api, security, testing, deployment, diagrams
├── scripts/erd/             ERD generator (schema.prisma → ERD.drawio)
├── docker-compose.yml       local development stack
├── docker-compose.prod.yml  production stack
├── .github/workflows/       CI
└── PROJECT_PROGRESS.md
```

Backend and frontend are independent npm packages (no workspace tooling) — they share no runtime code; the contract between them is the OpenAPI spec.

## 3. Backend

### 3.1 Structure

```
backend/src/
├── config/            env.ts (Zod-validated env), logger.ts, prisma.ts
├── common/
│   ├── errors/        AppError hierarchy, error codes, Prisma/PG error mapping
│   ├── middleware/    requestId, httpLogger, authenticate, authorize, validate,
│   │                  rateLimit, idempotencyKey, errorHandler, notFound
│   ├── auth/          permission catalogue (source of truth), token utilities
│   ├── db/            withTransaction (retry on deadlock), locking helpers, document numbering
│   ├── domain/        pure functions: pricing, payment status, return credit, WAC, money
│   ├── audit/         audit.record(tx, …)
│   └── utils/         pagination, sorting, dates/timezone helpers
├── modules/
│   ├── auth/  users/  roles/  dashboard/  products/  categories/  suppliers/
│   ├── customers/  purchases/  inventory/  orders/  payments/  returns/
│   └── reports/  audit-logs/  settings/
│       └── <module>/
│           ├── <module>.routes.ts       route table: path, permission, schema, controller
│           ├── <module>.controller.ts   HTTP ↔ service mapping only
│           ├── <module>.service.ts      business logic & transactions
│           ├── <module>.schemas.ts      Zod request/response schemas (also feed OpenAPI)
│           └── <module>.queries.ts      (only where justified) complex reads / raw SQL
├── docs/              OpenAPI assembly + Swagger UI mount
├── app.ts             express app factory (no listen) — used by tests
└── server.ts          bootstrap, listen, graceful shutdown
backend/tests/
├── unit/              pure domain functions, permission checks
├── integration/       Supertest against real PostgreSQL
└── helpers/           app factory, DB reset, fixtures, auth helpers
```

A separate repository layer is **not** added for every module: Prisma already is the data-access layer. Complex/raw queries (reports, locking) are isolated in `*.queries.ts` / `common/db`.

### 3.2 Layer responsibilities

| Layer | Does | Does not |
|-------|------|----------|
| Routes | Declare method, path, permission, Zod schemas, controller | Contain logic |
| Controller | Read validated input + `req.user`, call one service method, shape HTTP response/status | Touch Prisma, contain rules |
| Service | Enforce business rules, open transactions, lock rows, call inventory/payment/audit helpers | Know about `req`/`res` |
| Domain functions | Pure calculations (pricing, status, credit, WAC) | I/O |
| Inventory service | The **only** code that changes `products.stock_quantity` (`applyMovement(tx, …)`) | Commit on its own — always runs inside the caller's transaction |

Cross-module calls go through the other module's service (e.g. orders → `inventoryService.deductForOrder(tx, …)`), passing the transaction client.

### 3.3 Request pipeline

`requestId → helmet/cors → httpLogger → rateLimit → json parser → router → [authenticate → authorize(permission) → validate(schema) → idempotencyKey?] → controller → errorHandler`

### 3.4 Transactions, locking & idempotency

- `withTransaction(fn)` wraps `prisma.$transaction` (interactive, `READ COMMITTED`, timeout 10 s), retrying deadlocks/serialization failures up to 3 times.
- Locks: `SELECT … FOR UPDATE` through parameterised `$queryRaw`, always **document header first, then products ordered by id**.
- Idempotency: the middleware requires and validates `Idempotency-Key` on designated routes; the service looks up an existing row with that key **inside** the transaction and replays it (unique constraint catches the race and is mapped to a replay).
- Details: [BUSINESS_RULES.md §12](../requirements/BUSINESS_RULES.md#12-concurrency--idempotency-strategy).

### 3.5 Authentication & authorization

- Login → access JWT (15 min; claims `sub`, `tv` = token version) + opaque refresh token cookie (7 days, rotated, family-based reuse detection).
- `authenticate` verifies the JWT, loads the user with role permissions in one query, rejects inactive users or stale `token_version`. One indexed query per request is acceptable at this scale and makes deactivation/permission changes effective immediately.
- `authorize('orders.confirm')` checks the permission set; services add state/ownership rules (e.g. last-admin protection).
- The permission catalogue is a TypeScript constant; the seed syncs it into `permissions` and default role grants.

### 3.6 API conventions

- Base path `/api/v1`; JSON; plural resource nouns; state transitions as sub-resource actions: `POST /orders/:id/confirm`, `/complete`, `/cancel`; `POST /purchases/:id/receipts`; `POST /payments/:id/reversal`.
- Success: `200/201` with `{ "data": … }`; lists `{ "data": [...], "meta": { "page", "pageSize", "total", "totalPages" } }`.
- Error: `{ "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": [...], "requestId": "…" } }` with `400` (malformed), `401`, `403`, `404`, `409` (state conflict / duplicate), `422` (validation or business rule), `429`, `500`.
- Query: `page`, `pageSize`, `sort=field:asc|desc` (whitelisted), `search`, filters by name, date ranges `from`/`to` (ISO dates, business timezone).
- Money is serialised as **strings** (`"1250.50"`) to avoid float loss; quantities as integers.
- OpenAPI 3.1 spec in `docs/api/openapi.yaml`, served with Swagger UI at `/api/docs` (disabled in production unless enabled by env).

### 3.7 Logging & errors

pino JSON logs with request id and user id; redaction of secrets; `AppError` subclasses carry HTTP status + stable code; Prisma errors mapped (`P2002` → 409 `DUPLICATE`, `P2003` → 409 `REFERENCED`, CHECK violation → 422/500 depending on context, `40P01` → retry).

## 4. Frontend

```
frontend/src/
├── app/
│   ├── (auth)/login, forgot-password, reset-password, register
│   └── (dashboard)/layout.tsx          sidebar shell + auth guard
│       ├── dashboard/  products/  categories/  suppliers/  customers/
│       ├── purchases/  inventory/  orders/  payments/  returns/  reports/
│       ├── users/  roles/  audit-logs/  settings/  profile/
│       └── orders/[id]/invoice         print-optimised invoice view
├── components/ui/      shadcn/ui primitives
├── components/         DataTable, FormField, ConfirmDialog, MoneyInput, StatusBadge, PageHeader, EmptyState …
├── lib/api/            fetch client (auth header, single-flight refresh, error normalisation), typed endpoint functions
├── lib/auth/           AuthProvider (in-memory access token, current user + permissions), <Can permission>
├── lib/format/         Intl-based money/date/number formatting from business settings
└── hooks/              TanStack Query hooks per resource
```

- Dashboard pages are client components using **TanStack Query** (caching, loading/error states, invalidation after mutations). Server-side rendering adds little for an authenticated back-office app and would require server-side token handling.
- Forms: **react-hook-form + Zod** (shadcn Form). Validation mirrors the API; server field errors are mapped back to fields.
- Auth guard: on load the AuthProvider calls `/auth/refresh` (cookie) to obtain an access token and `/auth/me`; unauthenticated users are redirected to `/login?next=…`. The backend remains the authority.
- Permission-aware UI via `useCan('orders.cancel')`.

## 5. Deployment topology

- **Development:** `docker compose up` → `postgres`, `backend` (tsx watch), `frontend` (next dev), `mailpit`.
- **Production:** `docker-compose.prod.yml` → `postgres` (volume, not exposed), `backend` (node dist, non-root, runs `prisma migrate deploy` as a separate one-off step), `frontend` (Next standalone), behind a TLS-terminating reverse proxy (Caddy/Nginx — documented, user-provided).
- Persistent volumes: database data, uploads.

## 6. Module dependency rules

```
auth ─► users/roles
orders ─► inventory, payments(status recompute), audit
purchases ─► inventory, payments(status recompute), audit
returns ─► orders(read+lock), inventory, payments(status recompute), audit
payments ─► orders/purchases (lock + aggregates), audit
reports, dashboard ─► read-only SQL over all tables
```

No module writes another module's tables directly except through that module's service function, with the inventory ledger and payment aggregates as the two shared, single-writer paths.

# Technical Decisions

Format: decision → alternatives considered → rationale. All decisions are **Accepted** (Phase 1 review, 2026-11-08).

**Version policy (review decision):** use the long-established stable major of each dependency, not the newest. A major that is less than ~12 months old is skipped in favour of the previous one; security advisories override this (a patched version is always preferred). Chosen: Node 22 LTS, TypeScript 5.9, Express 5, Prisma 6.19, Zod 4, Vitest 4, pino 9, ESLint 9, Next.js 16 (16.4.6; upgraded from 15.5.29 to clear high-severity bundled `postcss` advisory), React 19, Tailwind CSS 4, PostgreSQL 16. Exception: nodemailer 10.x (all earlier majors have open high-severity advisories).

## TD-01 Modular monolith, two independent packages
- **Decision:** One Express API organised by domain modules + one Next.js app; separate `package.json`s, no monorepo tooling.
- **Alternatives:** microservices; Next.js API routes as the backend; npm/pnpm workspaces.
- **Why:** Transactions spanning orders/inventory/payments need one database transaction — microservices would add sagas for no benefit. A separate Express API matches the required stack and keeps the API reusable. No shared runtime code exists, so workspaces add tooling without payoff.

## TD-02 Prisma 6.19 (`prisma-client-js` generator)
- **Decision:** Prisma 6.19.3 — the long-established line (Prisma 7 is < 1 year old and changes the client/driver model). `deepmerge-ts` is pinned to ^8 via npm `overrides` to clear a CLI-config advisory.
- **Why:** Required by the stack. Prisma cannot express CHECK constraints, triggers or row locks → see TD-15 and TD-08. The same schema and migration were verified under 7.10 and 6.19 (no drift).

## TD-03 UUIDv7 primary keys
- **Alternatives:** serial/identity integers; UUIDv4.
- **Why:** Non-enumerable IDs in URLs, generated without a DB round trip, and time-ordered (better B-tree locality than v4). Human-facing identifiers are separate document numbers (TD-14).

## TD-04 Single-tenant with a singleton `business_settings` row
- **Alternatives:** `businesses` table + `business_id` on every table.
- **Why:** Multi-tenancy is explicitly out of scope. A singleton (CHECK `id = 1`) with typed columns is simpler and safer than a key-value table. Migrating to multi-tenant later means adding `business_id` + composite uniques — documented, not pre-built.

## TD-05 Money as `numeric`, quantities as integers
- **Decision:** `numeric(14,2)` amounts, `numeric(14,4)` costs, `numeric(7,4)` rates; integer quantities. API serialises money as strings; backend uses `Prisma.Decimal` (decimal.js).
- **Why:** No float rounding errors; integer stock avoids fractional drift and keeps CHECK constraints exact. Fractional quantities are a documented exclusion (A6).

## TD-06 Auth: stateless token API + Next.js server holding tokens in HttpOnly cookies (BFF)
- **Decision:** The Express API is transport-agnostic: login/refresh return the access JWT (15 min) and an opaque refresh token in the JSON body; protected endpoints take `Authorization: Bearer`. The Next.js server (Server Components, Server Actions, Route Handlers, middleware) is the only browser-facing client: it stores both tokens in `HttpOnly; Secure; SameSite=Lax` cookies on its own origin, attaches the bearer token to server-side `fetch` calls, and refreshes in middleware when the access token expires.
- **Alternatives:** in-memory access token in the browser (requires client-side fetching); backend-set cookies (cross-origin cookie handling); tokens in localStorage (XSS-exposed).
- **Why:** Follows the review decision to use Next.js native server-side fetching — tokens must be readable by the Next server, never by browser JS. CSRF is covered by `SameSite` cookies plus Next.js Server Actions' built-in origin check. Rotation uses token families with reuse detection and a 10-second grace window (parallel server requests refreshing at once). User status/permissions are re-read per request (one indexed query).

## TD-07 bcrypt for password hashing
- **Decision:** `bcrypt` (native, prebuilt binaries), cost factor 12 (4 in tests). Passwords are limited to 72 bytes (bcrypt's input limit) by validation, so no input is silently truncated.
- **Why:** Review decision; bcrypt is the long-established, widely audited choice.

## TD-08 Stock control: deduct at confirmation with pessimistic row locks
- **Alternatives:** reservation at draft time; optimistic concurrency (`version` column + retry); `SERIALIZABLE` isolation; single atomic `UPDATE … WHERE stock >= qty`.
- **Why:** The brief prefers deduct-on-confirm. Multi-line confirmation must be all-or-nothing and report *all* short lines, which is easiest with `SELECT … FOR UPDATE` on the product rows (sorted by id → no deadlocks), validate, then update. Lock hold time is milliseconds. The `stock_quantity >= 0` CHECK is the backstop if a code path ever forgets the lock. `SERIALIZABLE` would add retries everywhere for no extra safety.

## TD-09 Denormalised aggregates with a single writer
- **Decision:** Store `stock_quantity`, `cost_price`, `received_quantity`, `paid_amount`, `refunded_amount`, `returned_amount`, `payment_status`.
- **Alternatives:** compute from ledgers on every read.
- **Why:** Needed for row-lock-based concurrency checks (lock one row, compare) and for fast list filtering (e.g. "unpaid orders"). Consistency: each value is updated by exactly one service function, inside the same transaction as the ledger row, under a row lock; ledger rows are immutable, so a reconciliation query can verify aggregates at any time (planned as a test helper and an admin health check).

## TD-10 One immutable payment ledger with `PAYMENT` / `REFUND` / `REVERSAL`
- **Alternatives:** separate customer/supplier payment tables; editable payments with a `status` (void).
- **Why:** One table, one set of rules, one report path. Exactly one of `order_id`/`purchase_id` (CHECK). Corrections are new rows (reversal links 1:1 to the original), satisfying "immutable financial records".

## TD-11 Inventory movement references as explicit nullable FKs (not polymorphic)
- **Alternatives:** `reference_type` + `reference_id` without FK.
- **Why:** Real foreign keys keep referential integrity; a CHECK ties the populated FK to the movement type; composite UNIQUEs on `(order_id, product_id, type)`, `(purchase_receipt_id, product_id)`, `(sales_return_id, product_id)` make double stock effects impossible at DB level. Cost: three nullable columns.

## TD-12 Weighted-average costing
- **Alternatives:** static cost price; FIFO layers.
- **Why:** Gives meaningful inventory valuation and COGS without FIFO's layer tables. Cost snapshot per order line and per movement keeps history stable.

## TD-13 Per-entity idempotency keys
- **Alternatives:** generic `idempotency_keys` table storing serialized responses.
- **Why:** The key lives on the row it created (payment, receipt, return, adjustment movement) under a UNIQUE constraint, so "operation committed" and "key recorded" are the same atomic fact. Replay rebuilds the response from the row. State-transition endpoints are idempotent by their state machine instead.

## TD-14 Gap-free document numbers from a counter table
- **Alternatives:** PostgreSQL sequences (non-transactional → gaps); UUID-only references.
- **Why:** Invoices are expected to be sequential. Row-locked `UPDATE document_sequences … RETURNING` inside the business transaction is gap-free; contention is negligible at this scale. Prefix/padding are configurable in settings.

## TD-15 Database-level constraints in hand-written migration SQL
- **Decision:** CHECK constraints, append-only triggers and `pg_trgm` live in `prisma/sql/constraints.sql`, appended to the initial migration. Verified: Prisma's diff reports no drift after they are applied, so later migrations will not drop them.
- **Why:** Integrity cannot depend only on application code. Tested in Phase 1 with 22 negative cases against PostgreSQL 15.

## TD-16 Frontend data layer: Next.js native data fetching, no client data library
- **Decision:** Server Components fetch from the API with `fetch` (no caching for authenticated data — `cache: 'no-store'`); mutations are Server Actions followed by `revalidatePath`/`redirect`; list state (page, search, sort, filters) lives in URL search params; loading/error states via `loading.tsx` / `error.tsx` and `useActionState` / `useFormStatus`; local UI state with React `useState`/`useReducer`. No TanStack Query, SWR or global state library.
- **Why:** Review decision; the URL-as-state + server-rendering model covers this app's needs with fewer dependencies. Forms use shadcn/ui components with Zod validation shared between the client (instant feedback) and the Server Action. Planned extra deps: `sonner` (toasts), `lucide-react`, `recharts` (dashboard chart) — all part of the shadcn ecosystem.

## TD-17 Hand-written OpenAPI spec
- **Decision:** `docs/api/openapi.yaml` (OpenAPI 3.0) is written by hand alongside each module and served with `swagger-ui-express` at `/api/docs`. An integration test compares the Express route table with the spec's paths so an undocumented route fails CI.
- **Why:** Review decision — simple, no generator dependency; the route test prevents drift.

## TD-18 Logging with pino
- **Why:** Fast structured JSON, built-in redaction, `pino-http` request logging.

## TD-19 Email via nodemailer; Mailpit in development
- **Why:** Password reset needs email. Mailpit captures mail locally with no external account. In development without SMTP the reset link is also logged; never in production.

## TD-20 Product images on local disk (Docker volume)
- **Alternatives:** S3-compatible object storage.
- **Why:** No external service needed for the MVP. Storage is behind a tiny interface (`save`, `delete`, `url`) so S3 can be added later.

## TD-21 Integration tests against real PostgreSQL
- **Why:** Locking, constraints and triggers are part of the behaviour under test; mocks would hide exactly the bugs that matter. Tests use a dedicated database, migrate once, `TRUNCATE` between files (row triggers do not fire on TRUNCATE).

## TD-22 ERD generated from `schema.prisma` into editable draw.io
- **Decision:** `scripts/erd/generate-erd.mjs` parses the schema and writes `docs/diagrams/ERD.drawio` (5 pages); positions live in `scripts/erd/layout.mjs`. Export with the headless draw.io Docker image (procedure in `docs/diagrams/README.md`).
- **Why:** Keeps the ERD consistent with schema/migrations mechanically; the output is native draw.io XML (table shapes, crow's foot edges) and remains hand-editable.

## TD-23 TypeScript 5.9
- **Decision:** TypeScript 5.9.3, CommonJS output for the backend (`module: NodeNext`), strict mode with `noUncheckedIndexedAccess`.
- **Why:** Review decision — 5.x is the long-established line supported by every tool in the stack; 6.0/7.0 are recent.

## TD-24 In-memory rate limiting
- **Why:** Single instance. If scaled horizontally, switch `express-rate-limit` to a shared store (PostgreSQL or Redis) — noted in DEPLOYMENT.

## TD-25 Custom list query builder
- **Decision:** One reusable helper (`src/common/query`) turns validated query params (`page`, `pageSize`, `search`, `sort`, typed filters) into Prisma `where` / `orderBy` / `skip` / `take` plus pagination metadata. Each module declares its searchable fields, sortable fields (whitelist) and filter mappers.
- **Why:** Review decision; consistent pagination/search/sort/filter behaviour across all list endpoints without repeating code, and sort fields can never be injected.

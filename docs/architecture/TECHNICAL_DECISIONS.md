# Technical Decisions

Format: decision → alternatives considered → rationale. Status: **Accepted** unless marked **Proposed** (to be confirmed in Phase 2).

## TD-01 Modular monolith, two independent packages
- **Decision:** One Express API organised by domain modules + one Next.js app; separate `package.json`s, no monorepo tooling.
- **Alternatives:** microservices; Next.js API routes as the backend; npm/pnpm workspaces.
- **Why:** Transactions spanning orders/inventory/payments need one database transaction — microservices would add sagas for no benefit. A separate Express API matches the required stack and keeps the API reusable. No shared runtime code exists, so workspaces add tooling without payoff.

## TD-02 Prisma 7.10 with the `prisma-client` generator and `@prisma/adapter-pg`
- **Decision:** Prisma 7.10.1 (latest stable; npm's `latest` tag currently points at an 8.0 RC, which is not used). Connection URL lives in `prisma.config.ts`; runtime uses the pg driver adapter.
- **Why:** Required by the stack; v7 is the supported line. Prisma cannot express CHECK constraints, triggers or row locks → see TD-15 and TD-08.

## TD-03 UUIDv7 primary keys
- **Alternatives:** serial/identity integers; UUIDv4.
- **Why:** Non-enumerable IDs in URLs, generated without a DB round trip, and time-ordered (better B-tree locality than v4). Human-facing identifiers are separate document numbers (TD-14).

## TD-04 Single-tenant with a singleton `business_settings` row
- **Alternatives:** `businesses` table + `business_id` on every table.
- **Why:** Multi-tenancy is explicitly out of scope. A singleton (CHECK `id = 1`) with typed columns is simpler and safer than a key-value table. Migrating to multi-tenant later means adding `business_id` + composite uniques — documented, not pre-built.

## TD-05 Money as `numeric`, quantities as integers
- **Decision:** `numeric(14,2)` amounts, `numeric(14,4)` costs, `numeric(7,4)` rates; integer quantities. API serialises money as strings; backend uses `Prisma.Decimal` (decimal.js).
- **Why:** No float rounding errors; integer stock avoids fractional drift and keeps CHECK constraints exact. Fractional quantities are a documented exclusion (A6).

## TD-06 Auth: in-memory access JWT + rotating HttpOnly refresh cookie, same-origin via Next.js rewrite
- **Alternatives:** session cookies + server session store; both tokens in cookies; tokens in localStorage.
- **Why:** localStorage is XSS-exposed. A server session store is fine but the brief asks for access/refresh tokens with rotation. Proxying `/api` through the Next.js origin makes the refresh cookie first-party with `SameSite=Strict`, so no cross-site cookie or permissive CORS is needed. Rotation uses token families with reuse detection and a 10-second grace window so two tabs refreshing simultaneously do not log the user out. User status/permissions are re-read per request (TD-07 trade-off: one indexed query).

## TD-07 Argon2id for password hashing
- **Alternatives:** bcrypt, scrypt.
- **Why:** OWASP's first recommendation; memory-hard. `argon2` ships prebuilt binaries for Linux/Alpine and Windows.

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

## TD-16 Frontend data layer: client components + TanStack Query, react-hook-form + Zod, shadcn/ui
- **Alternatives:** Server Components + server actions with server-held tokens; SWR; Formik.
- **Why:** Authenticated back-office app with no SEO needs; TanStack Query gives caching, invalidation and loading/error states with little code; RHF + Zod is the shadcn Form standard. Additional deps: `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `sonner` (toasts), `recharts` (shadcn charts), `lucide-react`.

## TD-17 OpenAPI from Zod schemas — **Proposed**
- **Decision:** Generate `docs/api/openapi.yaml` from the route table + Zod schemas (`@asteasolutions/zod-to-openapi`, if its Zod 4 support is stable at implementation time; otherwise a hand-written spec plus a contract test that every route is documented). Swagger UI via `swagger-ui-express`. CI fails if the committed spec is stale.
- **Why:** Keeps docs synchronised with validation by construction.

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

## TD-23 TypeScript version — **Proposed**
- TypeScript 7.0 (native compiler) is the current `latest`. Phase 2 will use it only if `typescript-eslint`, Prisma's generated client and Next.js support it cleanly; otherwise pin the latest 5.x/6.x line. Decision recorded here once verified.

## TD-24 In-memory rate limiting
- **Why:** Single instance. If scaled horizontally, switch `express-rate-limit` to a shared store (PostgreSQL or Redis) — noted in DEPLOYMENT.

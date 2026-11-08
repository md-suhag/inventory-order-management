# AGENTS.md — instructions for any AI agent or developer working on this repo

Read this file first, then `PROJECT_PROGRESS.md`. These instructions apply to every agent (Claude Code, Codex, Cursor, Copilot, Gemini, …) and to humans.

## 1. What this is

Mini Inventory & Order Management System — a portfolio-grade, single-business app: purchasing + goods receipts, append-only stock ledger, orders + invoices, payments/refunds, sales returns, reports, RBAC, audit logs. Backend first (Express API), then a Next.js frontend.

## 2. Sources of truth (in priority order)

1. `docs/PROJECT_BRIEF.md` — the owner's original brief (scope, phases, working rules). Never silently drop a requirement from it.
2. **Owner decisions** in §4 below (they override the brief where they differ).
3. `docs/requirements/BUSINESS_RULES.md` — normative rules (`BR-…`), formulas, state machines, concurrency strategy.
4. `docs/requirements/FUNCTIONAL_REQUIREMENTS.md` (`FR-…`, permission matrix, exclusions) and `NON_FUNCTIONAL_REQUIREMENTS.md`.
5. `docs/architecture/TECHNICAL_DECISIONS.md` (`TD-…`) and `SYSTEM_ARCHITECTURE.md`.
6. `docs/database/DATABASE_DESIGN.md`, `backend/prisma/schema.prisma`, `backend/prisma/sql/constraints.sql`.
7. `docs/api/API_DESIGN.md` + `docs/api/openapi.yaml`.

`PROJECT_PROGRESS.md` says which phase is current and what is done. Update it when you finish work.

## 3. Process rules

- Work phase by phase as defined in the brief (§14). Current/next phase: see `PROJECT_PROGRESS.md`.
- **Stop for owner review** at the checkpoints the brief requires (end of Phase 1 was one; ask before major architectural changes). Otherwise work independently; ask only when a business rule is genuinely ambiguous — and for open questions, choose the conventional/standard option and document it.
- **Git:** one branch per phase (`phase-N/<short-name>`), **commit after each completed, specific task** (scaffold, a feature, its tests, docs), conventional-commit messages. Fast-forward merge into `main` at phase end. Never commit `.env` or secrets. Do not push or create remotes without the owner's permission.
- A task is **done** only when: implemented (no placeholders), tests written and passing, `npm run lint` + `npm run typecheck` clean, OpenAPI + API_DESIGN updated for new routes, docs/progress updated. Report real results; never claim untested work is complete.
- Do not add infrastructure (Redis, queues, microservices), multi-tenancy, multi-warehouse or ERP features unless the owner approves.

## 4. Owner decisions (Phase 1 review, 2026-11-08)

- **Stable versions, not newest:** prefer the long-established major; skip a major younger than ~12 months. Security advisories override this. Current: Node 22, TypeScript 5.9, Express 5, Prisma 6.19, Zod 4, Vitest 4, pino 9, ESLint 9, PostgreSQL 16, Next.js 15, React 19, Tailwind 4. Check `npm view <pkg> time` before adding a dependency; avoid unnecessary dependencies.
- **Password hashing: bcrypt.**
- **Frontend: Next.js native fetching** (Server Components, Server Actions, URL search params, React state). **No TanStack Query / SWR / global state libraries.** The Next.js server holds tokens in HttpOnly cookies (TD-06).
- **OpenAPI is hand-written** (`docs/api/openapi.yaml`); an integration test fails on undocumented or non-existent routes.
- **Custom list query builder** for pagination/search/sort/filter: `backend/src/common/query/list-query.ts` — use it for every list endpoint.
- Open assumptions A1–A7 in BUSINESS_RULES §13 are accepted as proposed.

## 5. Local setup (any machine: Windows, macOS, Linux)

Prerequisites: Node.js 22+, Docker (Desktop).

```bash
docker compose up -d                 # PostgreSQL 16 on host port 5433 (dbs: inventory, inventory_test) + Mailpit
cd backend
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed                      # admin@example.com / ChangeMe123!
npm run dev                          # http://localhost:4000, docs at /api/docs
npm test                             # unit + integration (needs the compose database)
npm run lint && npm run typecheck
```

On Windows Git Bash, prefix `docker run -v ...` commands with `MSYS_NO_PATHCONV=1`.

## 6. Backend conventions (follow existing code)

- **Module layout:** `src/modules/<module>/{<module>.routes.ts, .controller.ts, .service.ts, .schemas.ts}`; register the router in `src/routes.ts` (`apiModules`).
- **Controllers** use `handler({ body, query, params }, fn)` from `src/common/http/handler.ts` (Zod validation → 422 with field details); respond with `sendData` / `sendPage`. No business logic in routes/controllers.
- **Auth/RBAC:** `authenticate` then `authorize('<permission>')` on every protected route. New permissions go in `src/common/auth/permissions.ts` (+ default role grants, + FUNCTIONAL_REQUIREMENTS §2 matrix).
- **Transactions:** multi-step writes use `withTransaction` (`src/common/db/transaction.ts`). Lock order: document header first, then products sorted by id (`SELECT … FOR UPDATE` via `$queryRaw`).
- **Audit:** `recordAudit(tx, requestContext(req), {...})` inside the same transaction as the change.
- **Errors:** throw `AppError` helpers (`src/common/errors/app-error.ts`) with stable codes; never leak internals.
- **Stock** changes only through the inventory service, always writing an `inventory_movements` row in the same transaction. Ledgers (movements, payments, audit logs, receipts) are append-only (DB triggers).
- **Money:** `Prisma.Decimal`, never JS floats; serialise as strings.
- **Idempotency:** routes creating receipts/payments/adjustments/returns use `requireIdempotencyKey`; key stored on the created row (unique).
- **Users in responses:** only `publicUserSelect` (`src/modules/users/users.presenter.ts`).
- **Tests:** unit tests for pure logic in `tests/unit`; integration tests against real PostgreSQL in `tests/integration` using `resetDatabase()`, `createUser()`, `loginAs()`. Assert data effects and error codes, not just status codes.

## 7. Database changes

1. Edit `backend/prisma/schema.prisma` → `npm run db:migrate -- --name <change>` (creates a migration).
2. CHECK constraints / triggers: add SQL to a new migration **and** to `backend/prisma/sql/constraints.sql`.
3. Regenerate the ERD: `node scripts/erd/generate-erd.mjs`, re-export SVG/PNG (`docs/diagrams/README.md`), and update `docs/database/DATABASE_DESIGN.md`.

## 8. Communication with the owner

The owner writes in Banglish (romanised Bengali + English); reply in the same style, technical terms in English. They are an experienced JS/TS/Node/React developer: no tutorials, explain only important decisions briefly (~70–80% implementation, 20–30% explanation). Be explicit about which phase you are in and why you run verification commands.

# Project Progress

_Last updated: 2026-11-08_

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 · Inspection & requirements | ✅ Complete — awaiting review | Repo was empty; requirements, NFRs, business rules written |
| 1 · Architecture & database design | ✅ Complete — **awaiting approval** | Schema, constraints, migration, ERD (5 pages + exports), architecture docs |
| 2 · Backend foundation | ⏳ Not started (blocked on Phase 1 approval) | |
| 3 · Core business modules | ⏳ Not started | |
| 4 · Purchase & inventory | ⏳ Not started | |
| 5 · Orders & payments | ⏳ Not started | |
| 6 · Returns, reports, audit, settings | ⏳ Not started | |
| 7 · Frontend | ⏳ Not started | |
| 8 · Testing & hardening | ⏳ Not started | |
| 9 · Deployment preparation | ⏳ Not started | |
| 10 · Final review | ⏳ Not started | |

## Modules (implementation)

| Module | DB design | Backend | Frontend | Tests |
|--------|:-:|:-:|:-:|:-:|
| Auth & accounts | ✅ | – | – | – |
| Users & RBAC | ✅ | – | – | – |
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
| Audit logs | ✅ | – | – | – |
| Business settings | ✅ | – | – | – |

## Deliverables

| Path | Status |
|------|--------|
| docs/requirements/PROJECT_OVERVIEW.md | ✅ |
| docs/requirements/FUNCTIONAL_REQUIREMENTS.md | ✅ |
| docs/requirements/NON_FUNCTIONAL_REQUIREMENTS.md | ✅ |
| docs/requirements/BUSINESS_RULES.md | ✅ |
| docs/architecture/SYSTEM_ARCHITECTURE.md | ✅ |
| docs/architecture/TECHNICAL_DECISIONS.md | ✅ (TD-17, TD-23 proposed) |
| docs/architecture/system-architecture.mmd | ✅ |
| docs/database/DATABASE_DESIGN.md | ✅ |
| docs/diagrams/ERD.drawio (+ SVG/PNG exports, 5 pages) | ✅ generated & visually checked |
| docs/diagrams/order-flow.mmd | ✅ |
| backend/prisma/schema.prisma | ✅ validated (Prisma 7.10.1) |
| backend/prisma/sql/constraints.sql | ✅ tested on PostgreSQL 15 |
| backend/prisma/migrations/20261108000000_init | ✅ applied cleanly; no Prisma drift |
| scripts/erd/ (ERD generator) | ✅ |
| docs/api/API_DESIGN.md, openapi.yaml | ⏳ Phase 2+ (designed per module before implementation) |
| docs/security/SECURITY.md | ⏳ Phase 2 |
| docs/testing/TESTING_STRATEGY.md | ⏳ Phase 2 |
| docs/deployment/DEPLOYMENT.md | ⏳ Phase 9 |
| README.md | ⏳ Phase 2 (setup), completed in Phase 9 |

## Key technical decisions (summary — full list in TECHNICAL_DECISIONS.md)

- Modular monolith; Express API + Next.js; Next rewrites `/api` for a same-origin refresh cookie.
- Prisma 7.10.1 (8.0 is RC only); CHECKs/triggers in hand-written migration SQL.
- Stock deducted at order confirmation; pessimistic row locks (header → products by id) + DB CHECK backstop.
- Append-only ledgers: inventory_movements, payments, audit_logs, purchase receipts (DB triggers).
- Payments: single ledger with PAYMENT / REFUND / REVERSAL; stored aggregates with single writer.
- Weighted-average cost; cost snapshots on order lines and movements.
- Per-entity idempotency keys; state-machine idempotency for transitions.
- Gap-free document numbers via `document_sequences`.

## Open questions (Phase 1 review)

See BUSINESS_RULES.md §13 (A1–A7).

## Known issues

- None in code (no application code yet).
- The headless draw.io export needs `--shm-size=2g` (documented in docs/diagrams/README.md).

## Test status

| Suite | Status |
|-------|--------|
| DB constraint checks (manual SQL, Phase 1) | 22/22 rejected as expected |
| Unit / integration / E2E | Not started |

# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-10

Initial production-ready MVP release covering Phases 0–10: REST API backend, Next.js App Router BFF frontend, PostgreSQL 16 schema with database-enforced invariants, automated test suite, and containerized deployment stack.

### Core Modules & Features
- **Authentication & Accounts:** JWT access tokens (15m) + rotating opaque refresh token families with reuse detection, Next.js `HttpOnly` cookie BFF (`proxy.ts`), toggleable self-registration (`STAFF`, inactive until admin approval), forgot/reset password flow (SHA-256 hashed 30m tokens via SMTP/Mailpit), per-IP rate limiting, and 5-failure account lockout.
- **Users & Role-Based Access Control (RBAC):** Soft-deactivated users (last-active-admin guard), immutable `ADMIN` role, customizable `MANAGER`, `STAFF`, and custom roles backed by **43 granular permissions** enforced centrally at API routes/services and UI navigation/actions.
- **Catalog, Suppliers & Customers:** Categories hierarchy, product catalog (uppercase normalized SKUs, optional opening stock, `products.view_cost` gating, archive/history-guarded delete), magic-byte validated JPEG/PNG/WebP product image uploads (proxied via `/api/products/[id]/images/[imageId]`), supplier/customer directories with balance summaries, and walk-in order support.
- **Purchasing & Weighted-Average Costing (WAC):** Server-calculated draft purchase orders, `DRAFT -> ORDERED` confirmation, cancellation prior to receipts, idempotent partial/full goods receipts (`PURCHASE_RECEIPT`) blending product WAC, plus supplier payments, refunds (including cancelled advance-paid purchases), and ledger reversals.
- **Append-Only Inventory Ledger:** Single stock-mutating service (`applyMovement`), `IN_STOCK` / `LOW` / `OUT` threshold tracking, low-stock overview, and idempotent manual adjustments (`ADJUSTMENT_IN` / `ADJUSTMENT_OUT` with mandatory reasons).
- **Orders, Fulfillment & Invoicing:** Server-calculated drafts, atomic all-or-nothing order confirmation (`SELECT ... FOR UPDATE` header then products ordered by ID) with gap-free `INV-XXXXXX` numbers, fulfillment tracking (`CONFIRMED -> SHIPPED -> DELIVERED -> COMPLETED`), confirmed cancellation restocking (`SALE_CANCELLATION`), and print-optimized invoice view (`/orders/[id]/invoice`).
- **Customer Payments & Sales Returns:** Append-only payment ledger (`PAYMENT`, `REFUND`, `REVERSAL`), overpayment/over-refund guards, derived payment statuses, return requests against `DELIVERED` / `COMPLETED` orders, `RESALABLE` restocking (`SALE_RETURN`), `DAMAGED` credit tracking without restock, rounding-absorbing credit math, and return-linked refunds.
- **Operational Dashboard, Reports & Audit Logs:** Period-filtered dashboard KPIs, 8 analytical reporting endpoints (sales, purchases, inventory valuation, financial summary, customer/supplier aging) with formula-injection-safe CSV exports, transactional audit log ledger, and singleton business settings (`business_settings`).

### Data Integrity, Security & Architecture
- **Database Guarantees (PostgreSQL 16 + Prisma 6.19.3):** 25 tables, 43 foreign keys, 58 public `CHECK` constraints, 5 append-only triggers (`inventory_movements`, `audit_logs`, `payments`, `purchase_receipts`, `purchase_receipt_items`), 106 indexes (including `pg_trgm` GIN trigram search), and gap-free document numbering.
- **Financial & Concurrency Safety:** Arbitrary-precision `Prisma.Decimal` / `numeric` arithmetic serialized as strings, `READ COMMITTED` transactions with deterministic lock ordering and deadlock retries, and mandatory `Idempotency-Key` protection on receipts, adjustments, payments, refunds, reversals, and return creation.
- **Security Controls:** bcrypt (cost 12, 72-byte cap), pino structured log secret redaction, strict CORS/Helmet/CSP/security headers, open-redirect & UUID guards, `scripts/db/harden-app-role.sql` least-privilege DB role setup, and `0` high-severity production vulnerabilities (`npm audit --omit=dev`).
- **API & Documentation:** Hand-written OpenAPI 3 specification (`docs/api/openapi.yaml`, 81 paths / 112 operations) mounted at `/api/docs` (non-prod by default) and auto-generated multi-page Draw.io ERD + SVG/PNG exports (`docs/diagrams/`).

### Deployment & Quality Verification
- **Containers & Operations:** Multi-stage non-root `backend/Dockerfile` and `frontend/Dockerfile`, `docker-compose.yml` (dev + `fullstack` profile), `docker-compose.prod.yml`, `.env.prod.example`, PostgreSQL `backup.sh` / `restore.sh` scripts, and GitHub Actions CI (`.github/workflows/ci.yml`).
- **Verified Checks:**
  - Backend: **28 test files / 230 tests passed** (unit + PostgreSQL integration incl. 8 concurrency/idempotency/rollback/RBAC scenarios & OpenAPI route parity), ESLint, `tsc --noEmit`, `tsc -p tsconfig.build.json`.
  - Frontend: **4 Vitest files / 18 unit tests passed**, ESLint, `tsc --noEmit`, Next.js `16.4.6` production build (28 App Router routes), and **2 / 2 Playwright Chromium E2E tests passed**.

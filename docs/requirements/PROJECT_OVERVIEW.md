# Project Overview — Mini Inventory & Order Management System

## Purpose

A single-business web application for a small or medium-sized trading business (retail / wholesale) to run its day-to-day stock and sales operations: purchasing from suppliers, receiving goods, selling to customers, collecting payments, handling returns and seeing where the business stands — with an inventory and payment history that can be trusted.

The project is intended as a portfolio-grade system: the emphasis is on correct business workflows, data integrity under concurrency, and a maintainable codebase rather than feature breadth.

## Users and roles

| Role | Who | Summary of access |
|------|-----|-------------------|
| **Admin** | Owner / IT | Everything, including users, roles, business settings, audit logs. |
| **Manager** | Store / operations manager | All operational modules (catalog, suppliers, customers, purchases, inventory, orders, payments, returns) and all reports. No user/role/settings administration, no audit log. |
| **Staff** | Sales / counter staff | Create and process orders, record customer payments, request returns, view products and stock, manage customers, sales reports. No cost prices, purchasing, stock adjustments, financial reports or administration. |

Roles are data (roles ↔ permissions), so an Admin can create additional roles from the fixed permission catalogue. The full permission matrix is in [FUNCTIONAL_REQUIREMENTS.md §2](FUNCTIONAL_REQUIREMENTS.md#2-roles--permission-matrix).

## Core workflows

```
Supplier ─► Purchase (DRAFT → ORDERED) ─► Goods receipt(s) ─► stock ↑ (PURCHASE_RECEIPT)
                                     └─► Supplier payments
Customer ─► Order (DRAFT → CONFIRMED) ─► stock ↓ (SALE) ─► COMPLETED
                         │                  └─► Customer payments / refunds
                         └─► CANCELLED ─► stock ↑ (SALE_CANCELLATION)
Completed order ─► Sales return (PENDING → COMPLETED) ─► stock ↑ for resalable items (SALE_RETURN)
                                                      └─► Refund payment
Manager ─► Stock adjustment (reason required) ─► ADJUSTMENT_IN / ADJUSTMENT_OUT
```

## Scope

**In scope (MVP):** the 15 modules listed in [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md): authentication, users/RBAC, dashboard, products, categories, suppliers, customers, purchases with partial receiving, inventory ledger and adjustments, orders with invoices, payments (record/refund/reverse), sales returns, reports, audit logs, business settings.

**Deliberately excluded from the MVP** (documented with impact in [FUNCTIONAL_REQUIREMENTS.md §18](FUNCTIONAL_REQUIREMENTS.md#18-deliberate-exclusions)): multi-tenancy, multiple warehouses/locations, negative stock, fractional quantities, tax-inclusive pricing, purchase returns to suppliers, short-closing partially received purchases, payment gateway integration, double-entry accounting, serial/batch/expiry tracking, multi-currency transactions.

## Technology

Backend: Node.js, Express, TypeScript, PostgreSQL, Prisma ORM, Zod. Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui. Testing: Vitest, Supertest, Playwright. Tooling: Docker / Docker Compose, GitHub Actions, OpenAPI 3 + Swagger UI. See [../architecture/SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md).

## Milestones

| Phase | Deliverable | Gate |
|-------|-------------|------|
| 0–1 | Requirements, business rules, architecture, DB design, Prisma schema, Draw.io ERD | **Design review (approval required)** |
| 2 | Backend foundation: config, errors, validation, logging, auth, RBAC, health, test infra | |
| 3 | Users, categories, products, suppliers, customers, dashboard foundation | |
| 4 | Purchases, receiving, inventory ledger, adjustments, low stock | Inventory consistency tests pass |
| 5 | Orders, invoices, payments, balances | Concurrency / idempotency / rollback tests pass |
| 6 | Returns, reports, audit logs, settings | |
| 7 | Frontend (all screens, real APIs) | |
| 8 | Test completion & hardening | |
| 9 | Docker, CI, deployment docs | |
| 10 | Final review & checklist | |

Progress is tracked in [/PROJECT_PROGRESS.md](../../PROJECT_PROGRESS.md).

# API Design

Machine-readable contract: [`openapi.yaml`](openapi.yaml) (served at `/api/docs`, raw JSON at `/api/docs/openapi.json`). An integration test fails if a registered route is missing from the spec or the spec documents a route that does not exist.

## 1. Conventions

| Topic | Convention |
|-------|-----------|
| Base URL | `/api/v1` |
| Format | JSON (`Content-Type: application/json`), body limit 100 kB |
| Resources | Plural nouns: `/products`, `/purchases/:id/receipts` |
| State changes | Action sub-resources with `POST`: `/orders/:id/confirm`, `/orders/:id/cancel`, `/payments/:id/reversal` |
| Updates | `PATCH` with partial body; unknown fields are ignored |
| IDs | UUID (v7) in paths; human-facing numbers (`SO-000123`) are separate fields |
| Money | Strings with 2 decimals (`"1250.50"`); unit costs up to 4 decimals |
| Dates | ISO 8601 UTC timestamps; date-only filters (`from`, `to`) are interpreted in the business timezone |
| Auth | `Authorization: Bearer <accessToken>` |
| Correlation | `X-Request-Id` accepted (8–64 URL-safe chars) or generated; echoed on every response and in error bodies |

## 2. Responses

```jsonc
// single resource — 200 / 201
{ "data": { "id": "…", "name": "…" } }

// list — 200
{ "data": [ … ], "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 } }

// no content — 204 (logout, delete)
```

## 3. Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "Invalid email address" }],
    "requestId": "3f1c2a9e-5c4b-4d1e-9a51-0b7f0f1c2d3e"
  }
}
```

| HTTP | `code` values | When |
|------|---------------|------|
| 400 | `BAD_REQUEST`, `IDEMPOTENCY_KEY_REQUIRED`, `INVALID_TOKEN` (reset link) | Malformed JSON, missing headers, bad reset token |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` | No/invalid/expired access token; login failure |
| 403 | `FORBIDDEN`, `ACCOUNT_INACTIVE`, `REGISTRATION_DISABLED` | Missing permission; deactivated account |
| 404 | `NOT_FOUND` | Unknown route or resource |
| 409 | `CONFLICT`, `DUPLICATE`, `REFERENCED`, `INVALID_STATE_TRANSITION`, `TRANSACTION_CONFLICT` | Unique conflicts, referenced records, wrong document status, lock conflicts |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 100 kB |
| 422 | `VALIDATION_ERROR`, `INVALID_REFERENCE`, `BUSINESS_RULE_VIOLATION`, `IDEMPOTENCY_KEY_REUSED` | Field validation (all invalid fields listed); a referenced id in the body does not exist (e.g. `roleId`); business rule failures (e.g. insufficient stock, overpayment, last active admin) |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected; details never exposed in production |

Clients must branch on `code`, never on `message`.

## 4. Lists: pagination, search, sort, filters

All list endpoints share one query builder (`src/common/query/list-query.ts`).

| Param | Example | Rules |
|-------|---------|-------|
| `page` | `2` | ≥ 1, default 1 |
| `pageSize` | `50` | 1–100, default 20 |
| `search` | `acme` | Trimmed, ≤ 100 chars; case-insensitive *contains* over the module's searchable fields (may include related fields such as customer name) |
| `sort` | `name:asc,createdAt:desc` | Up to 3 keys; field must be in the endpoint's whitelist; `id` is appended as a tie-breaker so pages are stable |
| filters | `status=ACTIVE,ARCHIVED`, `isActive=true`, `from=2026-11-01&to=2026-11-30` | Per endpoint; enums accept comma lists or repeated params; booleans `true`/`false` |

Invalid values return `422 VALIDATION_ERROR` naming the parameter (e.g. `query.sort`).

## 5. Idempotency

Retry-prone operations that create financial or stock records require `Idempotency-Key: <8–100 chars, a UUID is recommended>`:
goods receipts, payments/refunds/reversals, stock adjustments, return requests.

- Same key + same payload → the original result is returned (`Idempotent-Replayed: true`), nothing is created twice.
- Same key + different payload → `422 IDEMPOTENCY_KEY_REUSED`.
- Missing/invalid key → `400 IDEMPOTENCY_KEY_REQUIRED`.

State transitions (`confirm`, `complete`, `cancel`, return `complete`/`reject`) are idempotent by state machine: repeating them returns `409 INVALID_STATE_TRANSITION` and has no side effects.

## 6. Authentication flow

```
POST /auth/login            { email, password }      → { accessToken (15 min), refreshToken (7 d), user }
GET  /any-protected-route   Authorization: Bearer …  → 401 TOKEN_EXPIRED when the access token expires
POST /auth/refresh          { refreshToken }         → new { accessToken, refreshToken }  (old one revoked)
POST /auth/logout           { refreshToken }         → 204 (session family revoked)
```

The Next.js server stores both tokens in HttpOnly cookies and performs refreshes; browsers never see tokens (TECHNICAL_DECISIONS TD-06).

## 7. Implemented endpoints

| Method | Path | Auth | Permission | Notes |
|--------|------|------|-----------|-------|
| GET | `/health/live` | – | – | Liveness |
| GET | `/health/ready` | – | – | Readiness (DB check), 503 when unavailable |
| POST | `/auth/login` | – | – | Lockout after 5 failures; 10 req/min/IP |
| POST | `/auth/refresh` | – | – | Rotation + reuse detection |
| POST | `/auth/logout` | – | – | Idempotent |
| POST | `/auth/logout-all` | ✔ | – | Revokes all sessions, invalidates access tokens |
| POST | `/auth/register` | – | – | Only when `allow_self_registration`; creates inactive STAFF |
| POST | `/auth/forgot-password` | – | – | Always 202; 5 req/hour/IP |
| POST | `/auth/reset-password` | – | – | Single-use token, revokes sessions |
| GET | `/auth/me` | ✔ | – | Profile + effective permissions |
| PATCH | `/auth/me` | ✔ | – | Name, phone |
| POST | `/auth/change-password` | ✔ | – | Returns a fresh token pair |
| GET | `/users` | ✔ | `users.read` | Search name/email; filters `roleId`, `isActive`; sort `name`, `email`, `createdAt`, `lastLoginAt` |
| POST | `/users` | ✔ | `users.manage` | Active user with initial password; ADMIN role only assignable by an admin |
| GET | `/users/:id` | ✔ | `users.read` | |
| PATCH | `/users/:id` | ✔ | `users.manage` | Name, phone, role; role change revokes sessions; not own role; last active admin protected |
| POST | `/users/:id/activate` | ✔ | `users.manage` | Idempotent; clears lockout |
| POST | `/users/:id/deactivate` | ✔ | `users.manage` | Idempotent; revokes sessions; not self; last active admin protected |
| GET | `/roles/permissions` | ✔ | `roles.read` | Permission catalogue |
| GET | `/roles` | ✔ | `roles.read` | With permissions + `userCount`; search name/description; sort `name`, `createdAt` |
| POST | `/roles` | ✔ | `roles.manage` | Custom role; names unique case-insensitively; non-admins only grant what they hold |
| GET | `/roles/:id` | ✔ | `roles.read` | |
| PATCH | `/roles/:id` | ✔ | `roles.manage` | `permissions` replaces the set; ADMIN immutable; system roles not renamable; non-admins not on own role |
| DELETE | `/roles/:id` | ✔ | `roles.manage` | Custom roles only; 409 `REFERENCED` while users hold it |
| GET | `/dashboard/summary` | ✔ | `dashboard.read` | `from`/`to` dates in business timezone (default current month); counts, orders by status, low/out of stock; `recentOrders` (`orders.read`), `recentPurchases` (`purchases.read`), `financials` (`dashboard.financials`) |
| GET | `/categories` | ✔ | `categories.read` | With `productCount`; search name/description; filter `status`; sort `name`, `createdAt`, `productCount` |
| POST | `/categories` | ✔ | `categories.manage` | Names unique case-insensitively |
| GET | `/categories/:id` | ✔ | `categories.read` | |
| PATCH | `/categories/:id` | ✔ | `categories.manage` | Name, description |
| DELETE | `/categories/:id` | ✔ | `categories.manage` | Only when no product references it (409 `REFERENCED`) |
| POST | `/categories/:id/archive` | ✔ | `categories.manage` | Idempotent |
| POST | `/categories/:id/unarchive` | ✔ | `categories.manage` | Idempotent |
| GET | `/products` | ✔ | `products.read` | Search name/SKU/barcode; filters `status`, `stockState` (IN_STOCK/LOW/OUT), `categoryId`; sort `name`, `sku`, `sellingPrice`, `stockQuantity`, `createdAt`. `costPrice` only with `products.view_cost` |
| POST | `/products` | ✔ | `products.manage` | SKU upper-cased, unique; optional `openingStock` → OPENING_STOCK movement; `costPrice` needs `products.view_cost`; category must be active |
| GET | `/products/:id` | ✔ | `products.read` | With `images`, `recentMovements` (10; `unitCost` only with `products.view_cost`) |
| PATCH | `/products/:id` | ✔ | `products.manage` | No stock field (BR-INV-01); `costPrice` needs `products.view_cost`; audited diff |
| DELETE | `/products/:id` | ✔ | `products.manage` | Only without purchase/order lines or movements (409 `REFERENCED`); removes image files |
| POST | `/products/:id/archive` | ✔ | `products.manage` | Idempotent |
| POST | `/products/:id/unarchive` | ✔ | `products.manage` | Idempotent; sets ACTIVE |
| POST | `/products/:id/images` | ✔ | `products.manage` | Multipart `images` (1–5 files); JPEG/PNG/WebP by magic bytes, ≤ 2 MB each (413), ≤ 5 per product (422) |
| PUT | `/products/:id/images/order` | ✔ | `products.manage` | `imageIds` lists every image once; first = primary |
| GET | `/products/:id/images/:imageId` | ✔ | `products.read` | Image bytes with stored content type, `nosniff` |
| DELETE | `/products/:id/images/:imageId` | ✔ | `products.manage` | Renumbers the rest; removes the file |
| GET | `/suppliers` | ✔ | `suppliers.read` | Search name/contact/phone/email; filter `status`; sort `name`, `createdAt` |
| POST | `/suppliers` | ✔ | `suppliers.manage` | Email lower-cased; empty optional fields stored as null |
| GET | `/suppliers/:id` | ✔ | `suppliers.read` | With `summary`: purchaseCount, totalPurchased, totalPaid, outstandingBalance (active purchases, BR-PAY-08) |
| PATCH | `/suppliers/:id` | ✔ | `suppliers.manage` | Any subset of fields; ""/null clears optional fields |
| DELETE | `/suppliers/:id` | ✔ | `suppliers.manage` | Only while no purchase references it (409 `REFERENCED`) |
| POST | `/suppliers/:id/archive` | ✔ | `suppliers.manage` | Idempotent; archived suppliers cannot receive new purchases |
| POST | `/suppliers/:id/unarchive` | ✔ | `suppliers.manage` | Idempotent |
| GET | `/customers` | ✔ | `customers.read` | Search name/phone/email; filter `status`; sort `name`, `createdAt` |
| POST | `/customers` | ✔ | `customers.manage` |  |
| GET | `/customers/:id` | ✔ | `customers.read` | With `summary`: orderCount, totalSales (net of returns), totalPaid, outstandingBalance (confirmed/completed orders) |
| PATCH | `/customers/:id` | ✔ | `customers.manage` | Any subset of fields; ""/null clears optional fields |
| DELETE | `/customers/:id` | ✔ | `customers.archive` | Only while no order references it (409 `REFERENCED`) |
| POST | `/customers/:id/archive` | ✔ | `customers.archive` | Idempotent; archived customers cannot be used on new orders |
| POST | `/customers/:id/unarchive` | ✔ | `customers.archive` | Idempotent |
| GET | `/purchases` | ✔ | `purchases.read` | Filter by `supplierId`, `status`, `paymentStatus`, date range; search by number / supplier reference; sort `purchaseNumber`, `createdAt`, `orderedAt`, `totalAmount` |
| POST | `/purchases` | ✔ | `purchases.manage` | Create DRAFT purchase; server calculates line and document totals, allocating header discount by largest remainder (BR-CALC-05); validates active supplier and products |
| GET | `/purchases/:id` | ✔ | `purchases.read` | Purchase detail with lines (ordered, received, remaining), receipts and balance due |
| PATCH | `/purchases/:id` | ✔ | `purchases.manage` | Update draft purchase fields and lines; 409 if not in DRAFT |
| DELETE | `/purchases/:id` | ✔ | `purchases.manage` | Delete draft purchase; 409 if not in DRAFT |
| POST | `/purchases/:id/confirm` | ✔ | `purchases.confirm` | Transitions DRAFT → ORDERED; locks line prices, stock remains unchanged (BR-PUR-01) |
| POST | `/purchases/:id/cancel` | ✔ | `purchases.cancel` | Allowed from DRAFT or ORDERED with 0 receipts; 409 if receipts exist |
| POST | `/purchases/:id/receipts` | ✔ | `purchases.receive` | Record goods receipt; increases stock with PURCHASE_RECEIPT movements, blends WAC (BR-INV-05); requires `Idempotency-Key` (BR-PUR-07) |
| GET | `/purchases/:id/receipts` | ✔ | `purchases.read` | List goods receipts for purchase |
| GET | `/inventory` | ✔ | `inventory.read` | Product inventory overview with stockState (IN_STOCK, LOW, OUT); `costPrice` and `stockValue` only with `products.view_cost` |
| GET | `/inventory/low-stock` | ✔ | `inventory.read` | Quick filter for products at or below reorder level |
| POST | `/inventory/adjustments` | ✔ | `inventory.adjust` | Single-product stock adjustment (IN/OUT); reason required, non-empty notes mandatory for OTHER; requires `Idempotency-Key` |
| GET | `/inventory/movements` | ✔ | `inventory.read` | Movement history; filter by product, type, dates, performedBy; unitCost gated by `products.view_cost` |
| GET | `/inventory/movements/:id` | ✔ | `inventory.read` | Movement detail; unitCost gated by `products.view_cost` |

Further modules are designed and added here (and to `openapi.yaml`) as each phase implements them.

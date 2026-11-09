# Functional Requirements

Requirement IDs (`FR-<MODULE>-nn`) are referenced from tests and the final review checklist. Business rules referenced as `BR-…` are defined in [BUSINESS_RULES.md](BUSINESS_RULES.md).

## 1. Conventions

- All list endpoints are paginated (`page`, `pageSize` ≤ 100), searchable where stated, and sortable by whitelisted fields.
- "Archive" = soft state change (`status = ARCHIVED` / `INACTIVE`); archived records stay visible in history and reports but cannot be used in new transactions.
- Every write that changes business data writes an audit log entry in the same transaction (§15).
- Authorization is enforced on the backend for every endpoint; the frontend only hides what the user cannot do.

## 2. Roles & permission matrix

Permissions are fixed in code (catalogue below) and assigned to roles in the database. System roles `ADMIN`, `MANAGER`, `STAFF` are seeded; `ADMIN` always holds every permission and cannot be edited or deleted. Admins can create custom roles from the catalogue.

| Permission | Purpose | Admin | Manager | Staff |
|---|---|:-:|:-:|:-:|
| `users.read` / `users.manage` | List/view users; create, update, activate/deactivate, assign roles | ✔ | – | – |
| `roles.read` / `roles.manage` | View roles; create/edit custom roles and their permissions | ✔ | – | – |
| `settings.update` | Change business settings, payment methods, document prefixes | ✔ | – | – |
| `audit_logs.read` | View audit logs | ✔ | – | – |
| `dashboard.read` | Operational dashboard (counts, recent activity, low stock) | ✔ | ✔ | ✔ |
| `dashboard.financials` | Financial dashboard tiles (sales value, profit, inventory value, purchase value) | ✔ | ✔ | – |
| `categories.read` / `categories.manage` | View / create, edit, archive, delete categories | ✔ | ✔ | read |
| `products.read` | View products & stock | ✔ | ✔ | ✔ |
| `products.manage` | Create, edit, archive/delete products, upload images | ✔ | ✔ | – |
| `products.view_cost` | See cost price, unit cost, valuation, margins | ✔ | ✔ | – |
| `suppliers.read` / `suppliers.manage` | View / create, edit, archive suppliers | ✔ | ✔ | – |
| `customers.read` / `customers.manage` | View / create, edit customers | ✔ | ✔ | ✔ |
| `customers.archive` | Archive customers | ✔ | ✔ | – |
| `purchases.read` / `purchases.manage` | View / create & edit draft purchases | ✔ | ✔ | – |
| `purchases.confirm` / `purchases.receive` / `purchases.cancel` | Place order with supplier / record goods receipt / cancel | ✔ | ✔ | – |
| `inventory.read` | Inventory overview, movement history | ✔ | ✔ | ✔ |
| `inventory.adjust` | Manual stock adjustments | ✔ | ✔ | – |
| `orders.read` / `orders.manage` | View / create & edit drafts, cancel drafts | ✔ | ✔ | ✔ |
| `orders.confirm` / `orders.complete` | Confirm (deducts stock) / complete orders | ✔ | ✔ | ✔ |
| `orders.cancel` | Cancel a **confirmed** order (restores stock) | ✔ | ✔ | – |
| `orders.discount` | Apply line-item or order-level discounts | ✔ | ✔ | – |
| `payments.read` | View payments (supplier payments additionally need `purchases.read`) | ✔ | ✔ | ✔ |
| `payments.record_customer` | Record customer payments against orders | ✔ | ✔ | ✔ |
| `payments.record_supplier` | Record supplier payments against purchases | ✔ | ✔ | – |
| `payments.refund` | Record refunds (customer or supplier) | ✔ | ✔ | – |
| `payments.reverse` | Reverse an erroneous payment/refund record | ✔ | ✔ | – |
| `returns.read` / `returns.create` | View / request sales returns | ✔ | ✔ | ✔ |
| `returns.process` | Approve (complete) or reject returns | ✔ | ✔ | – |
| `reports.sales` | Sales reports | ✔ | ✔ | ✔ |
| `reports.purchases` / `reports.inventory` / `reports.financial` | Purchase, inventory and financial reports | ✔ | ✔ | – |

Every authenticated user can read their own profile and the non-sensitive business settings needed to render the UI (name, currency, locale, timezone, tax label).

## 3. Authentication & account management (AUTH)

| ID | Requirement |
|----|-------------|
| FR-AUTH-01 | Login with email + password returns a short-lived access token (JWT, 15 min) and a rotating opaque refresh token (7 days). The Next.js server stores both in `HttpOnly`, `Secure`, `SameSite=Lax` cookies; browser JavaScript never sees them. |
| FR-AUTH-02 | `POST /auth/refresh` rotates the refresh token (old one revoked, new one issued in the same family). Presenting an already-rotated token outside a short grace window revokes the whole token family (reuse detection). |
| FR-AUTH-03 | Logout revokes the current refresh token family and clears the cookie. "Log out of all sessions" revokes every refresh token for the user and bumps `token_version`. |
| FR-AUTH-04 | Self-registration is available **only** when `business_settings.allow_self_registration = true`; self-registered users get the `STAFF` role and are created **inactive** until an Admin activates them. Otherwise accounts are created by Admins. |
| FR-AUTH-05 | Forgot password: always responds identically (no account enumeration); if the account exists and is active, emails a single-use reset link valid for 30 minutes. Only the SHA-256 hash of the token is stored. |
| FR-AUTH-06 | Reset password consumes the token, sets the new password, revokes all sessions and bumps `token_version`. |
| FR-AUTH-07 | Authenticated user can view and update their profile (name, phone) — not email, role or status. |
| FR-AUTH-08 | Change password requires the current password; revokes all other sessions. |
| FR-AUTH-09 | Brute-force protection: per-IP rate limit on auth endpoints, and per-account lockout (5 consecutive failures → locked 15 min). Lockout responses are indistinguishable from bad credentials. |
| FR-AUTH-10 | Deactivated users cannot log in or refresh; existing access tokens stop working on the next request (user status is checked on every authenticated request). |
| FR-AUTH-11 | Passwords: min 8 characters, max 72 bytes (bcrypt limit), at least one letter and one digit; hashed with bcrypt (cost 12). Password hashes, token hashes and lockout counters never appear in API responses or logs. |
| FR-AUTH-12 | Frontend routes under the dashboard require an authenticated session; unauthenticated users are redirected to login and returned to the original page afterwards. |

## 4. User management & RBAC (USER, ROLE)

| ID | Requirement |
|----|-------------|
| FR-USER-01 | Admin can create users (name, email, phone, role, initial password or "must reset" flow), update name/phone/role, activate and deactivate. |
| FR-USER-02 | List users with pagination, search (name, email) and filters (role, active). |
| FR-USER-03 | The system must always retain at least one **active** user holding the `ADMIN` role; deactivating or demoting the last one is rejected (BR-USER-02). |
| FR-USER-04 | Users cannot change their own role or deactivate themselves. |
| FR-USER-05 | Deactivating a user or changing their role revokes their sessions. |
| FR-USER-06 | Users are never hard-deleted (historical records reference them). |
| FR-ROLE-01 | List roles with their permissions and user counts. |
| FR-ROLE-02 | Create / rename / delete custom roles; delete only when no users hold the role. |
| FR-ROLE-03 | Edit the permission set of `MANAGER`, `STAFF` and custom roles. `ADMIN` is immutable. |
| FR-ROLE-04 | All authorization goes through one central `authorize(permission)` middleware plus service-level checks for ownership/state rules. |

## 5. Dashboard (DASH)

All figures come from live database aggregates; date range defaults to the current month in the business timezone. Financial tiles require `dashboard.financials`. Formulas are defined in [BUSINESS_RULES.md §9](BUSINESS_RULES.md#9-financial-metric-definitions).

| ID | Requirement |
|----|-------------|
| FR-DASH-01 | Counts: active products, active customers, active suppliers, orders in range (by status). |
| FR-DASH-02 | Pending orders = orders in `CONFIRMED` status (not yet completed); draft count shown separately. |
| FR-DASH-03 | Financial tiles: net sales, estimated gross profit, purchase value (received), current inventory value, outstanding customer balance. |
| FR-DASH-04 | Low-stock count and a list of low-stock / out-of-stock products. |
| FR-DASH-05 | Recent orders and recent purchases (latest 5–10). |
| FR-DASH-06 | Sales overview chart with date-range filter and daily/weekly/monthly granularity. |

## 6. Products (PROD)

| ID | Requirement |
|----|-------------|
| FR-PROD-01 | Create/update products: name, SKU, barcode (optional), description, category (optional), unit of measure, cost price, selling price, optional tax-rate override, optional reorder level, status. |
| FR-PROD-02 | Optional opening stock on create — recorded as an `OPENING_STOCK` movement at the given cost price. Stock can never be edited directly afterwards (BR-INV-01). |
| FR-PROD-03 | SKU is required, trimmed, upper-cased and unique. Barcode, when provided, is unique. |
| FR-PROD-04 | Prices ≥ 0; reorder level ≥ 0; tax rate 0–100. |
| FR-PROD-05 | List with pagination, search by name/SKU/barcode (trigram-indexed), filters by category, status, stock state (in stock / low / out). |
| FR-PROD-06 | Product detail shows stock, low-stock state, recent movements; cost fields only with `products.view_cost`. |
| FR-PROD-07 | Upload up to 5 images per product (JPEG/PNG/WebP, ≤ 2 MB each, content-type verified by magic bytes); reorder and delete images; first image is primary. |
| FR-PROD-08 | Delete is allowed only when the product has never been referenced by a purchase, order or inventory movement; otherwise the product must be archived (BR-PROD-02). |
| FR-PROD-09 | Inactive/archived products cannot be added to new purchases or orders, and orders containing them cannot be confirmed. They remain visible in history and reports. |
| FR-PROD-10 | Product edits never change historical order/purchase lines (snapshots, BR-SNAP-01). |

## 7. Categories (CAT)

| ID | Requirement |
|----|-------------|
| FR-CAT-01 | Create, rename, describe, archive/unarchive categories. Names unique (case-insensitive check). |
| FR-CAT-02 | List and search categories with product counts. |
| FR-CAT-03 | Delete only if no product references the category; otherwise archive. |
| FR-CAT-04 | Archived categories cannot be assigned to products; products already in them keep the reference. |

## 8. Suppliers (SUP)

| ID | Requirement |
|----|-------------|
| FR-SUP-01 | Create/update suppliers: name, contact person, phone, email, address, notes. |
| FR-SUP-02 | Archive/unarchive; archived suppliers cannot receive new purchases. No hard delete once referenced by a purchase. |
| FR-SUP-03 | Search (name, phone, email) and paginate. |
| FR-SUP-04 | Supplier detail: purchase history, totals purchased, total paid, outstanding balance (BR-PAY-08). |

## 9. Customers (CUST)

| ID | Requirement |
|----|-------------|
| FR-CUST-01 | Create/update customers: name, phone, email, address, notes. |
| FR-CUST-02 | Archive/unarchive; archived customers cannot be used on new orders. Hard delete only while no order references the customer (same `customers.archive` permission). |
| FR-CUST-03 | Search (name, phone, email) and paginate. |
| FR-CUST-04 | Customer detail: order history, payment history, outstanding balance. |
| FR-CUST-05 | Orders may be placed for a **walk-in customer** (no customer record); an optional name/phone is stored only on the order. |

## 10. Purchases (PUR)

| ID | Requirement |
|----|-------------|
| FR-PUR-01 | Create a purchase as `DRAFT`: supplier, lines (product, quantity, unit cost, optional line discount), optional header discount (fixed or percentage), tax rate per line (default from settings when tax is enabled), supplier reference, expected delivery date, notes. |
| FR-PUR-02 | Totals are calculated server-side (BR-CALC-*); client-sent totals are ignored. |
| FR-PUR-03 | Drafts can be edited or deleted. |
| FR-PUR-04 | Confirm: `DRAFT → ORDERED`. Lines become read-only. No stock change. |
| FR-PUR-05 | Receive goods (`ORDERED`/`PARTIALLY_RECEIVED`): one receipt with one or more lines, each quantity ≤ remaining. Creates a receipt, increases stock with `PURCHASE_RECEIPT` movements, updates weighted-average cost, and moves status to `PARTIALLY_RECEIVED` or `RECEIVED`. Requires an `Idempotency-Key`. |
| FR-PUR-06 | Cancel: allowed from `DRAFT` or `ORDERED` with no receipts (BR-PUR-05). |
| FR-PUR-07 | Record supplier payments (and refunds for cancelled purchases) — see §13. |
| FR-PUR-08 | List and filter by supplier, status, payment status, date range; search by purchase number / supplier reference. |
| FR-PUR-09 | Purchase detail shows lines with ordered/received/remaining quantities, receipts, payments and balance. |

## 11. Inventory (INV)

| ID | Requirement |
|----|-------------|
| FR-INV-01 | Inventory overview: per product stock, reorder level, stock state, and (with `products.view_cost`) unit cost and stock value. Search and filter by category and stock state. |
| FR-INV-02 | Low-stock list: `stock_quantity ≤ reorder level` (product override or business default) and `> 0`. Out-of-stock list: `stock_quantity = 0`. Only active products. |
| FR-INV-03 | Manual adjustment (single product): direction (in/out), quantity > 0, reason (enum), notes (required when reason is `OTHER`). Cannot reduce stock below zero. Requires `Idempotency-Key`. |
| FR-INV-04 | Movement history with filters: product, movement type, date range, reference (order / purchase receipt / return number), performed by. |
| FR-INV-05 | Movement detail: product, type, quantity change, previous and resulting stock, unit cost (permission-gated), reference document link, reason, notes, user, timestamp. |
| FR-INV-06 | Opening stock is visible as an `OPENING_STOCK` movement on the product. |
| FR-INV-07 | No endpoint exists that sets stock directly; movements cannot be edited or deleted. |

## 12. Orders (ORD)

| ID | Requirement |
|----|-------------|
| FR-ORD-01 | Create a `DRAFT` order: customer or walk-in, lines (product, quantity), optional line discounts and order-level discount (`orders.discount`), notes. Unit price defaults to the product's current selling price; tax rate from product override or business default. |
| FR-ORD-02 | Totals calculated server-side: subtotal, discount, tax, total (BR-CALC-*). |
| FR-ORD-03 | Drafts can be edited (re-snapshotting current prices for changed lines) and cancelled. Drafts never affect stock. |
| FR-ORD-04 | Confirm: validates every product is active and has sufficient stock, deducts stock atomically (one `SALE` movement per line), snapshots unit cost, assigns an invoice number, captures the billing snapshot. Fails as a whole if any line fails (BR-ORD-03). |
| FR-ORD-05 | Complete: `CONFIRMED → COMPLETED` (goods handed over / delivered). No stock change. |
| FR-ORD-06 | Cancel: `DRAFT → CANCELLED` (no stock effect) or `CONFIRMED → CANCELLED` (restores stock exactly once with `SALE_CANCELLATION` movements). `COMPLETED` orders cannot be cancelled — use a return. |
| FR-ORD-07 | List, search (order number, invoice number, customer name/phone) and filter (status, payment status, customer, date range). |
| FR-ORD-08 | Order detail: lines, totals, payments, returns, balance, status timeline. |
| FR-ORD-09 | Printable invoice (HTML print view) for confirmed/completed orders: business details from settings, invoice number, billing snapshot, line snapshots, discounts, tax breakdown, totals, paid, balance due, footer. |

## 13. Payments (PAY)

| ID | Requirement |
|----|-------------|
| FR-PAY-01 | Record a payment against an order (`CONFIRMED`/`COMPLETED`) or a purchase (`ORDERED`/`PARTIALLY_RECEIVED`/`RECEIVED`): amount, method, paid-at date, reference, notes. Requires `Idempotency-Key`. |
| FR-PAY-02 | Full and partial payments; amount must not exceed the current balance due (BR-PAY-03). |
| FR-PAY-03 | Refunds: amount ≤ refundable balance (BR-PAY-04); customer refunds may be linked to a completed sales return. |
| FR-PAY-04 | Reversal: voids a payment or refund that was recorded in error by writing a `REVERSAL` row with a mandatory reason; the original stays untouched; a record can be reversed once; reversals cannot be reversed. |
| FR-PAY-05 | Payment status (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`) is derived and stored on the order/purchase, independent of order/purchase status (BR-PAY-06). |
| FR-PAY-06 | Payment list with filters (direction customer/supplier, type, method, date range, document) and payment detail. |
| FR-PAY-07 | Payment methods are configurable (create, rename, activate/deactivate, order); inactive methods cannot be used for new payments. Seeded: Cash, Bank transfer, Card, Mobile wallet, Cheque. |

## 14. Sales returns (RET)

| ID | Requirement |
|----|-------------|
| FR-RET-01 | Request a return against a `COMPLETED` order: lines (order item, quantity, condition `RESALABLE`/`DAMAGED`), reason, notes. Status `PENDING`. Requires `Idempotency-Key`. |
| FR-RET-02 | Quantity per line ≤ sold quantity − quantities in other `PENDING` or `COMPLETED` returns (BR-RET-02). |
| FR-RET-03 | Credit amounts are calculated server-side from the order line's actual net price and tax (BR-RET-04). |
| FR-RET-04 | Process (`returns.process`): **complete** — restocks resalable lines with `SALE_RETURN` movements, adds the credit to the order's `returned_amount`, recalculates payment status; or **reject** with a reason. |
| FR-RET-05 | Refund money for a completed return is a separate payment operation (FR-PAY-03). |
| FR-RET-06 | Return list/detail with filters (status, order, customer, date range). |

## 15. Reports (REP)

All reports accept a date range (interpreted in the business timezone), paginate tabular output, and are computed with SQL aggregates. Metric formulas: [BUSINESS_RULES.md §9](BUSINESS_RULES.md#9-financial-metric-definitions). CSV export of each table is included.

| ID | Report | Permission |
|----|--------|-----------|
| FR-REP-01 | Sales summary by day / week / month / custom range (gross sales, discounts, returns, net sales, tax, order count) | `reports.sales` |
| FR-REP-02 | Sales by product (qty sold, qty returned, net sales; margin with `products.view_cost`) | `reports.sales` |
| FR-REP-03 | Sales by customer (orders, net sales, outstanding) | `reports.sales` |
| FR-REP-04 | Orders by status (count, value) | `reports.sales` |
| FR-REP-05 | Purchase history / purchases by supplier / purchase totals by date range (ordered value, received value, paid) | `reports.purchases` |
| FR-REP-06 | Current stock, low-stock, out-of-stock | `reports.inventory` |
| FR-REP-07 | Inventory movement history (filters as FR-INV-04) with totals per type | `reports.inventory` |
| FR-REP-08 | Inventory valuation (qty × weighted-average cost, by category) | `reports.inventory` + `products.view_cost` |
| FR-REP-09 | Financial summary: net sales revenue, COGS, estimated gross profit & margin, purchase cost, tax collected | `reports.financial` |
| FR-REP-10 | Outstanding customer balances and outstanding supplier balances (aged by document date: 0–30, 31–60, 61–90, 90+ days) | `reports.financial` |
| FR-REP-11 | Payment summary by method and type, money in vs. money out | `reports.financial` |

## 16. Audit logs (AUD)

| ID | Requirement |
|----|-------------|
| FR-AUD-01 | Record: user create/update/activate/deactivate/role change; role & permission changes; login success/failure/lockout; product create/update/archive/delete/image changes; category/supplier/customer changes; purchase create/update/confirm/cancel/receive; order create/update/confirm/complete/cancel; payment record/refund/reversal; stock adjustments; return request/complete/reject; settings & payment-method changes. |
| FR-AUD-02 | Each entry: actor, action, entity type, entity id, metadata (changed fields before/after, document numbers), IP, user agent, request id, timestamp. Secrets are never logged. |
| FR-AUD-03 | Written in the same DB transaction as the change (no audit without change, no change without audit). |
| FR-AUD-04 | Read-only list with filters (actor, action, entity type/id, date range) for `audit_logs.read`. No API to edit or delete; the table rejects UPDATE/DELETE. |

## 17. Business settings (SET)

| ID | Requirement |
|----|-------------|
| FR-SET-01 | Business profile: name, legal name, tax registration number, email, phone, address, logo. |
| FR-SET-02 | Currency (ISO 4217 code), locale (formatting) and IANA timezone. Currency can only be changed while no confirmed orders, purchases or payments exist (amounts are stored without currency). |
| FR-SET-03 | Tax: enabled flag, label (e.g. "VAT"), default rate. Applies to new drafts only. |
| FR-SET-04 | Invoice: document number prefixes and padding (orders, invoices, purchases, receipts, payments, returns), invoice footer text. |
| FR-SET-05 | Low stock: default reorder threshold, alerts on/off. |
| FR-SET-06 | Self-registration toggle (FR-AUTH-04). |
| FR-SET-07 | Payment method configuration (FR-PAY-07). |

## 18. Deliberate exclusions

| Excluded | Reason | Impact / workaround |
|----------|--------|---------------------|
| Multi-tenancy / multiple businesses | Explicitly out of MVP scope | One deployment per business. Schema can gain `business_id` later. |
| Multiple warehouses / locations | Out of scope | Single stock figure per product. |
| Negative stock (configurable) | Simplifies integrity; enforced by DB CHECK | Sales beyond stock are rejected; receive or adjust first. |
| Fractional quantities | Integer quantities avoid rounding drift in stock | Use a smaller base unit (e.g. g instead of kg). |
| Tax-inclusive pricing | One pricing model keeps calculations auditable | Prices are entered tax-exclusive; tax is added. |
| Purchase returns to suppliers / supplier credit notes | Not requested | Use `ADJUSTMENT_OUT` (reason DAMAGED/OTHER) + supplier refund on a cancelled purchase only. |
| Short-closing a partially received purchase | Keeps receiving rules simple | A `PARTIALLY_RECEIVED` purchase stays open until fully received. *Open question in the Phase 1 review.* |
| Stock reservation for drafts | MVP strategy: deduct at confirmation | Drafts can fail at confirmation if stock ran out. |
| Payment gateway | Requirement says record only | Payments are recorded manually. |
| Store credit / customer wallet, overpayment | Overpayment is rejected | Return credit must be refunded or offsets an unpaid balance. |
| Double-entry accounting, net profit | Out of scope | Reports show *estimated gross* profit only. |
| Batch / serial / expiry tracking, quarantine stock for damaged returns | Out of scope | Damaged returns are credited but not stocked. |
| Return window enforcement | Not requested | Any completed order is eligible. |
| Email notifications other than password reset | Not requested | — |

# Business Rules

These rules are normative: services must implement them, tests must cover them, and the database enforces the ones marked **[DB]** as a last line of defence. Assumptions that are still open for confirmation are marked **[ASSUMPTION]** and collected in §13.

## 1. General

- **BR-GEN-01** Single business, single currency, single stock location.
- **BR-GEN-02** Money is stored as `numeric(14,2)` in the currency's major unit; unit cost / weighted-average cost as `numeric(14,4)`; rates as percentages `numeric(7,4)`. Arithmetic uses decimal (never binary floating point). Rounding: **half-up to 2 decimals per line** (§3). **[DB]** types.
- **BR-GEN-03** Quantities are positive integers in the product's base unit. **[DB]**
- **BR-GEN-04** All timestamps are stored in UTC. Date filters and report buckets use the business timezone from settings.
- **BR-GEN-05** Document numbers (`SO-000123`, `INV-000045`, `PO-…`, `GRN-…`, `PAY-…`, `RET-…`) are allocated from `document_sequences` inside the business transaction, so they are gap-free and never reused.
- **BR-GEN-06** Records referenced by history are never hard-deleted; they are archived/deactivated. **[DB]** `ON DELETE RESTRICT`.
- **BR-GEN-07** Every business write produces an audit log entry in the same transaction.

## 2. Users & access

- **BR-USER-01** Email is unique and stored lower-case. **[DB]**
- **BR-USER-02** At least one active user with the `ADMIN` role must exist at all times. Deactivation, role change and role-permission edits that would violate this are rejected. Checked under a transaction-scoped advisory lock so two concurrent admin changes cannot both pass.
- **BR-USER-03** A user cannot change their own role or deactivate themselves.
- **BR-USER-04** Deactivation, role change, password change/reset revoke refresh tokens and bump `token_version` (invalidates outstanding access tokens).
- **BR-USER-05** `ADMIN` role permissions are immutable; system roles cannot be deleted; a role with users cannot be deleted.
- **BR-AUTH-01** 5 consecutive failed logins lock the account for 15 minutes; a successful login resets the counter.
- **BR-AUTH-02** Refresh token reuse (presenting a token that was already rotated, after a 10-second grace window) revokes the entire token family.

## 3. Pricing & document calculations (orders and purchases)

Same algorithm for order lines (`unit_price`) and purchase lines (`unit_cost`). All server-side; client totals are ignored.

| Step | Formula |
|------|---------|
| BR-CALC-01 | `gross_i = quantity_i × unit_price_i` |
| BR-CALC-02 | `line_discount_i` is an absolute amount, `0 ≤ line_discount_i ≤ gross_i` |
| BR-CALC-03 | `subtotal = Σ (gross_i − line_discount_i)` |
| BR-CALC-04 | Header discount: `FIXED` → `discount_amount = value` (must be ≤ subtotal, else 422); `PERCENTAGE` (0–100) → `discount_amount = round2(subtotal × value / 100)` |
| BR-CALC-05 | Header discount is **allocated** to lines in proportion to `gross_i − line_discount_i`, using the largest-remainder method on cents so that `Σ allocated_discount_i = discount_amount` exactly |
| BR-CALC-06 | `taxable_i = gross_i − line_discount_i − allocated_discount_i` |
| BR-CALC-07 | `tax_i = round2(taxable_i × tax_rate_i / 100)`; `tax_rate_i` = product override, else business default, or 0 when tax is disabled (purchases: editable per line, defaulting the same way) |
| BR-CALC-08 | `line_total_i = taxable_i + tax_i` |
| BR-CALC-09 | `tax_amount = Σ tax_i`; `total_amount = subtotal − discount_amount + tax_amount` (= `Σ line_total_i`). **[DB]** formula CHECK |

Prices are tax-exclusive. Allocation (BR-CALC-05) is what makes per-line tax, per-line net revenue and exact return credits possible.

- **BR-CALC-10** Line and header discounts on orders require `orders.discount`.
- **BR-CALC-11** A product may appear only once per document (quantities are merged). **[DB]** unique (document, product)

## 4. Snapshots & historical integrity

- **BR-SNAP-01** Order lines store product name, SKU, unit, unit price, discount, allocated discount, tax rate, tax amount and line total; at confirmation they also store `unit_cost` (WAC at that moment). Purchase lines store product name, SKU and unit cost. Later product edits never change these.
- **BR-SNAP-02** Orders store a billing snapshot (customer name, phone, address) at confirmation; walk-in orders store an optional name/phone or "Walk-in customer".
- **BR-SNAP-03** Lines of non-draft orders and purchases are read-only (except `received_quantity`, maintained by receiving).
- **BR-SNAP-04** **[ASSUMPTION]** Draft order prices are snapshotted when a line is added or edited. Confirmation keeps the draft's prices; it does not silently re-price. The UI warns when a draft line's price differs from the product's current price, and the user can refresh prices before confirming.

## 5. Products & categories

- **BR-PROD-01** SKU is trimmed, upper-cased, non-empty and unique; barcode unique when present. **[DB]**
- **BR-PROD-02** A product can be deleted only if it has no purchase lines, order lines or movements; otherwise archive. **[DB]** FK restrict
- **BR-PROD-03** Only `ACTIVE` products can be added to drafts or confirmed in orders/purchases.
- **BR-PROD-04** Low stock: `0 < stock_quantity ≤ COALESCE(reorder_level, settings.default_low_stock_threshold)`; out of stock: `stock_quantity = 0`.
- **BR-CAT-01** A category can be deleted only when no product references it; archived categories cannot be newly assigned.

## 6. Inventory

- **BR-INV-01** `products.stock_quantity` changes **only** through the inventory service, which writes exactly one `inventory_movements` row per product per operation in the same transaction. There is no API to set stock directly.
- **BR-INV-02** Stock can never go below zero. **[DB]** `CHECK (stock_quantity >= 0)`
- **BR-INV-03** Movement integrity: `resulting = previous + change`, sign fixed by type, the reference matching the type must be set, adjustments require a reason (and notes for `OTHER`). **[DB]**
- **BR-INV-04** Movements are append-only. Mistakes are corrected with a compensating adjustment. **[DB]** trigger
- **BR-INV-05** Weighted-average cost (WAC) — `products.cost_price`:
  - Inbound with a known cost: `new_cost = (old_qty × old_cost + in_qty × in_cost) / (old_qty + in_qty)`, rounded to 4 decimals; if `old_qty = 0`, `new_cost = in_cost`.
  - `PURCHASE_RECEIPT`: `in_cost = taxable_i / quantity_i` of the purchase line (net of discounts, excluding tax — **[ASSUMPTION]** purchase tax is recoverable).
  - `SALE_CANCELLATION`, `SALE_RETURN`: `in_cost = order_item.unit_cost` snapshot.
  - `OPENING_STOCK`: sets the cost to the entered cost price.
  - `ADJUSTMENT_IN`: enters at the current cost (cost unchanged). Outbound movements never change cost.
  - Manual edit of cost price (`products.manage`) is allowed and audited; it does not rewrite movement history.
- **BR-INV-06** Every movement records `unit_cost` (cost basis used), the user and timestamp.

## 7. Purchases

State machine:

```
DRAFT ──confirm──► ORDERED ──receive (partial)──► PARTIALLY_RECEIVED ──receive (rest)──► RECEIVED
  │                   │  └──────receive (all)─────────────────────────────────────────────►┘
  └──cancel──► CANCELLED ◄──cancel (no receipts)──┘
DRAFT may also be deleted.
```

- **BR-PUR-01** Drafts and `ORDERED` purchases never change stock.
- **BR-PUR-02** Only an active supplier and active products can be used; a purchase needs ≥ 1 line.
- **BR-PUR-03** Receiving: each receipt line `0 < qty ≤ quantity − received_quantity`. Implemented as a conditional update (`… WHERE received_quantity + :qty <= quantity`), so concurrent receipts cannot over-receive. **[DB]** `CHECK (received_quantity BETWEEN 0 AND quantity)`
- **BR-PUR-04** Status after a receipt: all lines fully received → `RECEIVED` (+ `received_at`), otherwise `PARTIALLY_RECEIVED`.
- **BR-PUR-05** Cancel only from `DRAFT` or `ORDERED` with no receipts. `PARTIALLY_RECEIVED` and `RECEIVED` cannot be cancelled (received goods are physically in stock).
- **BR-PUR-06** Receipts are append-only. **[DB]** trigger
- **BR-PUR-07** A repeated receive request with the same `Idempotency-Key` returns the original receipt and does not touch stock. **[DB]** unique key + unique (receipt, product) on movements.

## 8. Orders

State machine:

```
DRAFT ──confirm (deduct stock)──► CONFIRMED ──complete──► COMPLETED ──► (sales returns)
  │                                   │
  └──cancel──► CANCELLED ◄──cancel (restore stock)──┘
```

- **BR-ORD-01** Drafts never change stock; draft stock levels shown in the UI are informational only.
- **BR-ORD-02** An order needs ≥ 1 line; customer (if any) must be active; all products active.
- **BR-ORD-03** Confirmation is all-or-nothing: in one transaction, lock the order, lock all products (ordered by id), verify stock for every line, deduct stock, write one `SALE` movement per line, snapshot `unit_cost`, assign the invoice number, set `CONFIRMED`. If any line is short, nothing changes and the response lists every short line. **[DB]** stock CHECK and unique `(order_id, product_id, type)` make double deduction impossible.
- **BR-ORD-04** Confirming a non-draft order returns `409 INVALID_STATE_TRANSITION` and changes nothing.
- **BR-ORD-05** Completing changes only status/timestamps — never stock.
- **BR-ORD-06** Cancelling a `CONFIRMED` order restores each line's quantity with one `SALE_CANCELLATION` movement (at the snapshot cost) — exactly once (status guard + DB unique). `COMPLETED` orders cannot be cancelled. Cancelling does not touch payments: any money received becomes refundable (BR-PAY-04).
- **BR-ORD-07** Invoice number is assigned at confirmation and never changes; a cancelled confirmed order keeps it (invoice shows CANCELLED). **[DB]** invoice ⇔ confirmed_at

## 9. Financial metric definitions

All sales figures **exclude tax**. Sales are recognised at **confirmation** (`confirmed_at`), returns at **return completion** (`processed_at`), purchases at **goods receipt** (`received_at`). Orders currently `CANCELLED` are excluded entirely.

| Metric | Formula |
|--------|---------|
| Gross sales | `Σ quantity × unit_price` over lines of `CONFIRMED`/`COMPLETED` orders confirmed in range |
| Discounts | `Σ (discount_amount + allocated_discount)` over the same lines |
| Returns | `Σ sales_return_items.subtotal` of `COMPLETED` returns processed in range |
| **Net sales (revenue)** | `Gross sales − Discounts − Returns` |
| Tax collected | `Σ order line tax − Σ return line tax` (same date rules) |
| COGS | `Σ quantity × unit_cost` (sold lines) `− Σ returned quantity × unit_cost` for **RESALABLE** completed returns |
| **Estimated gross profit** | `Net sales − COGS`; margin = profit / net sales |
| Purchase value (received) | `Σ purchase_receipt_items.quantity × unit_cost` received in range (excl. tax) |
| Purchases ordered | `Σ purchases.total_amount` (incl. tax) for purchases ordered in range, excluding `CANCELLED` |
| Inventory value | `Σ stock_quantity × cost_price` over all non-archived products (point in time) |
| Outstanding customer balance | `Σ max(balance_due, 0)` over `CONFIRMED`/`COMPLETED` orders |
| Outstanding supplier balance | `Σ max(balance_due, 0)` over `ORDERED`/`PARTIALLY_RECEIVED`/`RECEIVED` purchases |
| Money in / money out | in = customer `PAYMENT` + supplier `REFUND`; out = supplier `PAYMENT` + customer `REFUND`; each net of reversals; by `paid_at` |

**Limitations (shown in the UI next to profit figures):** gross profit is an estimate based on weighted-average cost at the time of sale; it excludes operating expenses, stock write-offs (adjustments and damaged returns are reported separately as "stock losses"), and shipping. It is **not** audited net profit. Cancelling an order later removes it from the period in which it was confirmed. Revenue is never labelled as profit; payments are cash figures and are not mixed into revenue.

## 10. Payments

Definitions per document (order or purchase):

```
paid_amount     = Σ PAYMENT  − Σ REVERSAL of PAYMENT
refunded_amount = Σ REFUND   − Σ REVERSAL of REFUND
net_paid        = paid_amount − refunded_amount
effective_total = 0 if CANCELLED; order: total_amount − returned_amount; purchase: total_amount
balance_due     = effective_total − net_paid     (negative = money owed back)
```

- **BR-PAY-01** Payment rows are immutable and append-only; the amount is always positive and the type gives the direction. **[DB]**
- **BR-PAY-02** Customer payments are allowed on `CONFIRMED`/`COMPLETED` orders; supplier payments on `ORDERED`/`PARTIALLY_RECEIVED`/`RECEIVED` purchases (advance payments before receipt are allowed).
- **BR-PAY-03** `PAYMENT.amount ≤ balance_due`. Overpayment is rejected (no store credit in the MVP).
- **BR-PAY-04** `REFUND.amount ≤ min(net_paid, −balance_due)`, i.e. only money that is actually owed back (after a return, a cancellation, or a reversed charge) can be refunded.
- **BR-PAY-05** `REVERSAL` voids one specific `PAYMENT` or `REFUND` in full, requires a reason, can happen once per record (**[DB]** unique `reversed_payment_id`), and cannot target another reversal. Reversing a payment is rejected if it would make `refunded_amount > paid_amount`. **[DB]**
- **BR-PAY-06** Payment status (stored, recalculated in the same transaction as each payment/return/cancellation):
  1. `refunded_amount > 0` → `REFUNDED` if `net_paid = 0`, else `PARTIALLY_REFUNDED`
  2. else `paid_amount = 0` → `UNPAID` (or `PAID` when an active document's `effective_total = 0`)
  3. else `net_paid ≥ effective_total` → `PAID`
  4. else `PARTIALLY_PAID`

  Payment status is independent of order/purchase status.
- **BR-PAY-07** Every payment write locks the document row (`SELECT … FOR UPDATE`), recomputes the balance from the locked row, inserts the payment and updates the aggregates in one transaction — concurrent payments cannot exceed the balance.
- **BR-PAY-08** Customer/supplier outstanding balance = sum of positive `balance_due` over their documents (BR §9).
- **BR-PAY-09** Payment requests require an `Idempotency-Key`; a retry returns the original payment.
- **BR-PAY-10** Only active payment methods can be used; `paid_at` cannot be in the future.

## 11. Sales returns

- **BR-RET-01** Returns are allowed only for `COMPLETED` orders. (Confirmed-but-not-completed orders are cancelled instead.)
- **BR-RET-02** For each order line: `requested_qty ≤ quantity − Σ qty in PENDING and COMPLETED returns` of that line. Validated under the order row lock, both at request and at completion.
- **BR-RET-03** Return lines are `RESALABLE` (restocked) or `DAMAGED` (credited, not restocked). Only resalable lines create `SALE_RETURN` movements, at the original `unit_cost`.
- **BR-RET-04** Credit per return line (computed at completion against previously **completed** returns of that line):
  - if this return takes the line to fully returned: `subtotal = taxable − Σ previous subtotal`, `tax = tax_amount − Σ previous tax` (absorbs rounding);
  - otherwise `subtotal = round2(taxable × q / quantity)`, `tax = round2(tax_amount × q / quantity)`;
  - `total = subtotal + tax`. The request stores a preview using the same formula.
- **BR-RET-05** Completing a return: restock resalable lines, add the return `total_amount` to `orders.returned_amount`, recompute payment status — one transaction. The original order, its lines and payments are never modified otherwise.
- **BR-RET-06** Refunding money is a separate `REFUND` payment (optionally linked to the return), subject to BR-PAY-04. If the order was not fully paid, the credit first reduces the balance due.
- **BR-RET-07** Duplicate protection: `Idempotency-Key` on the request; status guard (`PENDING` only) on completion/rejection; unique `(sales_return_id, product_id)` on movements. **[DB]**

## 12. Concurrency & idempotency strategy

- **BR-CONC-01** Isolation level `READ COMMITTED` plus explicit row locks; locks are always taken in the order **document header → products sorted by id** to avoid deadlocks.
- **BR-CONC-02** Stock deduction: lock product rows `FOR UPDATE`, validate, update; the stock CHECK is the backstop.
- **BR-CONC-03** State transitions use the locked row's current status; an unexpected status → `409`.
- **BR-CONC-04** Deadlock (`40P01`) / serialization failures are retried up to 3 times with jitter; other errors roll back the whole transaction (no partial stock or payment effects).
- **BR-IDEM-01** `Idempotency-Key` (client-generated UUID) is **required** for: goods receipt, payment/refund/reversal, stock adjustment, return request. Stored on the created row (unique). Same key + same payload → original response replayed (`Idempotent-Replayed: true`); same key + different payload → `422 IDEMPOTENCY_KEY_REUSED`.
- **BR-IDEM-02** Confirm / complete / cancel / process-return are idempotent by state machine: repeating them never repeats side effects.

## 13. Open assumptions (for Phase 1 review)

| # | Assumption | Alternative |
|---|-----------|-------------|
| A1 | Draft order keeps its snapshotted prices at confirmation (BR-SNAP-04). | Re-price at confirmation, or block with `409 PRICE_CHANGED`. |
| A2 | Self-registered users are `STAFF` and inactive until approved (FR-AUTH-04). | Active immediately. |
| A3 | Returns only for `COMPLETED` orders (BR-RET-01). | Also allow `CONFIRMED`. |
| A4 | No short-close of partially received purchases (BR-PUR-05). | Add a "close" action that freezes remaining quantities and adjusts the payable to the received value. |
| A5 | Purchase tax is recoverable, so inventory cost excludes tax (BR-INV-05). | Capitalise tax into cost. |
| A6 | Integer quantities only. | `numeric(12,3)` quantities for weight/volume goods. |
| A7 | Staff can confirm and complete orders but cannot cancel confirmed ones or give discounts. | Adjust the permission matrix (it's data, editable by Admin). |

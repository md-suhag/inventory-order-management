-- =============================================================================
-- Hand-written database constraints (not expressible in schema.prisma).
--
-- This file is the source for the custom section appended to the initial
-- migration (prisma/migrations/<ts>_init/migration.sql). Prisma does not
-- introspect CHECK constraints or triggers into its diff, so later
-- `prisma migrate dev` runs will neither drop nor recreate them. Any change
-- here must ship as a new migration and be reflected in DATABASE_DESIGN.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuration
-- -----------------------------------------------------------------------------
ALTER TABLE business_settings
  ADD CONSTRAINT business_settings_singleton_chk     CHECK (id = 1),
  ADD CONSTRAINT business_settings_currency_chk      CHECK (currency_code ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT business_settings_tax_rate_chk      CHECK (default_tax_rate BETWEEN 0 AND 100),
  ADD CONSTRAINT business_settings_low_stock_chk     CHECK (default_low_stock_threshold >= 0);

ALTER TABLE document_sequences
  ADD CONSTRAINT document_sequences_next_chk    CHECK (next_number >= 1),
  ADD CONSTRAINT document_sequences_padding_chk CHECK (padding BETWEEN 1 AND 12);

-- -----------------------------------------------------------------------------
-- Identity
-- -----------------------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase_chk  CHECK (email = lower(email)),
  ADD CONSTRAINT users_failed_attempts_chk  CHECK (failed_login_attempts >= 0),
  ADD CONSTRAINT users_token_version_chk    CHECK (token_version >= 0);

-- -----------------------------------------------------------------------------
-- Catalog
-- -----------------------------------------------------------------------------
ALTER TABLE products
  ADD CONSTRAINT products_sku_normalized_chk CHECK (sku = upper(btrim(sku)) AND sku <> ''),
  ADD CONSTRAINT products_stock_nonneg_chk   CHECK (stock_quantity >= 0),
  ADD CONSTRAINT products_cost_nonneg_chk    CHECK (cost_price >= 0),
  ADD CONSTRAINT products_price_nonneg_chk   CHECK (selling_price >= 0),
  ADD CONSTRAINT products_reorder_nonneg_chk CHECK (reorder_level IS NULL OR reorder_level >= 0),
  ADD CONSTRAINT products_tax_rate_chk       CHECK (tax_rate IS NULL OR tax_rate BETWEEN 0 AND 100);

ALTER TABLE product_images
  ADD CONSTRAINT product_images_size_chk CHECK (size_bytes > 0);

-- -----------------------------------------------------------------------------
-- Purchasing
-- -----------------------------------------------------------------------------
ALTER TABLE purchases
  ADD CONSTRAINT purchases_amounts_nonneg_chk CHECK (
    subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0),
  ADD CONSTRAINT purchases_discount_le_subtotal_chk CHECK (discount_amount <= subtotal),
  ADD CONSTRAINT purchases_total_formula_chk CHECK (total_amount = subtotal - discount_amount + tax_amount),
  ADD CONSTRAINT purchases_discount_input_chk CHECK (
    (discount_type IS NULL AND discount_value IS NULL)
    OR (discount_type = 'FIXED' AND discount_value >= 0)
    OR (discount_type = 'PERCENTAGE' AND discount_value BETWEEN 0 AND 100)),
  ADD CONSTRAINT purchases_payments_chk CHECK (
    paid_amount >= 0 AND refunded_amount >= 0 AND refunded_amount <= paid_amount);

ALTER TABLE purchase_items
  ADD CONSTRAINT purchase_items_qty_chk      CHECK (quantity > 0),
  ADD CONSTRAINT purchase_items_received_chk CHECK (received_quantity BETWEEN 0 AND quantity),
  ADD CONSTRAINT purchase_items_line_no_chk  CHECK (line_no > 0),
  ADD CONSTRAINT purchase_items_amounts_chk  CHECK (
    unit_cost >= 0 AND discount_amount >= 0 AND allocated_discount >= 0
    AND tax_amount >= 0 AND line_total >= 0
    AND discount_amount + allocated_discount <= quantity * unit_cost),
  ADD CONSTRAINT purchase_items_tax_rate_chk CHECK (tax_rate BETWEEN 0 AND 100);

ALTER TABLE purchase_receipt_items
  ADD CONSTRAINT purchase_receipt_items_qty_chk  CHECK (quantity > 0),
  ADD CONSTRAINT purchase_receipt_items_cost_chk CHECK (unit_cost >= 0);

-- -----------------------------------------------------------------------------
-- Sales
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD CONSTRAINT orders_amounts_nonneg_chk CHECK (
    subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0),
  ADD CONSTRAINT orders_discount_le_subtotal_chk CHECK (discount_amount <= subtotal),
  ADD CONSTRAINT orders_total_formula_chk CHECK (total_amount = subtotal - discount_amount + tax_amount),
  ADD CONSTRAINT orders_discount_input_chk CHECK (
    (discount_type IS NULL AND discount_value IS NULL)
    OR (discount_type = 'FIXED' AND discount_value >= 0)
    OR (discount_type = 'PERCENTAGE' AND discount_value BETWEEN 0 AND 100)),
  ADD CONSTRAINT orders_payments_chk CHECK (
    paid_amount >= 0 AND refunded_amount >= 0 AND refunded_amount <= paid_amount),
  ADD CONSTRAINT orders_returned_chk CHECK (returned_amount BETWEEN 0 AND total_amount),
  -- Invoice number exists iff the order has been confirmed at some point.
  ADD CONSTRAINT orders_invoice_chk CHECK ((invoice_number IS NULL) = (confirmed_at IS NULL));

ALTER TABLE order_items
  ADD CONSTRAINT order_items_qty_chk      CHECK (quantity > 0),
  ADD CONSTRAINT order_items_line_no_chk  CHECK (line_no > 0),
  ADD CONSTRAINT order_items_amounts_chk  CHECK (
    unit_price >= 0 AND (unit_cost IS NULL OR unit_cost >= 0)
    AND discount_amount >= 0 AND allocated_discount >= 0
    AND tax_amount >= 0 AND line_total >= 0
    AND discount_amount + allocated_discount <= quantity * unit_price),
  ADD CONSTRAINT order_items_tax_rate_chk CHECK (tax_rate BETWEEN 0 AND 100);

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------
ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive_chk CHECK (amount > 0),
  -- A payment belongs to exactly one document.
  ADD CONSTRAINT payments_single_target_chk   CHECK (num_nonnulls(order_id, purchase_id) = 1),
  -- REVERSAL rows (and only those) point at the payment they void.
  ADD CONSTRAINT payments_reversal_link_chk   CHECK ((type = 'REVERSAL') = (reversed_payment_id IS NOT NULL)),
  ADD CONSTRAINT payments_reversal_self_chk   CHECK (reversed_payment_id IS NULL OR reversed_payment_id <> id),
  ADD CONSTRAINT payments_reversal_notes_chk  CHECK (type <> 'REVERSAL' OR (notes IS NOT NULL AND btrim(notes) <> '')),
  -- Return-linked rows must be customer refunds.
  ADD CONSTRAINT payments_return_link_chk     CHECK (
    sales_return_id IS NULL OR (type = 'REFUND' AND order_id IS NOT NULL));

-- -----------------------------------------------------------------------------
-- Sales returns
-- -----------------------------------------------------------------------------
ALTER TABLE sales_returns
  ADD CONSTRAINT sales_returns_amounts_chk CHECK (
    subtotal >= 0 AND tax_amount >= 0 AND total_amount = subtotal + tax_amount),
  ADD CONSTRAINT sales_returns_processed_chk CHECK (
    (status = 'PENDING') = (processed_at IS NULL)),
  ADD CONSTRAINT sales_returns_rejection_chk CHECK (
    status <> 'REJECTED' OR rejection_reason IS NOT NULL);

ALTER TABLE sales_return_items
  ADD CONSTRAINT sales_return_items_qty_chk     CHECK (quantity > 0),
  ADD CONSTRAINT sales_return_items_amounts_chk CHECK (
    subtotal >= 0 AND tax_amount >= 0 AND total_amount = subtotal + tax_amount);

-- -----------------------------------------------------------------------------
-- Inventory ledger
-- -----------------------------------------------------------------------------
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_nonzero_chk   CHECK (quantity_change <> 0),
  ADD CONSTRAINT inventory_movements_arith_chk     CHECK (resulting_stock = previous_stock + quantity_change),
  ADD CONSTRAINT inventory_movements_nonneg_chk    CHECK (previous_stock >= 0 AND resulting_stock >= 0),
  ADD CONSTRAINT inventory_movements_cost_chk      CHECK (unit_cost IS NULL OR unit_cost >= 0),
  ADD CONSTRAINT inventory_movements_direction_chk CHECK (
    (type IN ('OPENING_STOCK', 'PURCHASE_RECEIPT', 'SALE_CANCELLATION', 'SALE_RETURN', 'ADJUSTMENT_IN')
       AND quantity_change > 0)
    OR (type IN ('SALE', 'ADJUSTMENT_OUT') AND quantity_change < 0)),
  ADD CONSTRAINT inventory_movements_reference_chk CHECK (
    CASE type
      WHEN 'PURCHASE_RECEIPT'  THEN purchase_receipt_id IS NOT NULL AND order_id IS NULL AND sales_return_id IS NULL
      WHEN 'SALE'              THEN order_id IS NOT NULL AND purchase_receipt_id IS NULL AND sales_return_id IS NULL
      WHEN 'SALE_CANCELLATION' THEN order_id IS NOT NULL AND purchase_receipt_id IS NULL AND sales_return_id IS NULL
      WHEN 'SALE_RETURN'       THEN sales_return_id IS NOT NULL AND purchase_receipt_id IS NULL AND order_id IS NULL
      ELSE num_nonnulls(purchase_receipt_id, order_id, sales_return_id) = 0
    END),
  ADD CONSTRAINT inventory_movements_adjustment_chk CHECK (
    (type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')) = (adjustment_reason IS NOT NULL)),
  ADD CONSTRAINT inventory_movements_other_notes_chk CHECK (
    adjustment_reason IS DISTINCT FROM 'OTHER' OR (notes IS NOT NULL AND btrim(notes) <> ''));

-- -----------------------------------------------------------------------------
-- Append-only ledgers: block UPDATE and DELETE at the database level.
-- (Row triggers do not fire on TRUNCATE, which test suites use for resets.
--  Production hardening: run the app as a non-owner role and REVOKE
--  UPDATE/DELETE on these tables — see docs/security/SECURITY.md.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on append-only table "%" is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER inventory_movements_append_only
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

CREATE TRIGGER payments_append_only
  BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

CREATE TRIGGER purchase_receipts_append_only
  BEFORE UPDATE OR DELETE ON purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

CREATE TRIGGER purchase_receipt_items_append_only
  BEFORE UPDATE OR DELETE ON purchase_receipt_items
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

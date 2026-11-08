-- Initial schema. Sections: (1) extensions, (2) Prisma-generated DDL, (3) hand-written constraints from prisma/sql/constraints.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ORDER', 'INVOICE', 'PURCHASE', 'PURCHASE_RECEIPT', 'PAYMENT', 'SALES_RETURN');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PAYMENT', 'REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "SalesReturnStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReturnItemCondition" AS ENUM ('RESALABLE', 'DAMAGED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_STOCK', 'PURCHASE_RECEIPT', 'SALE', 'SALE_CANCELLATION', 'SALE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('COUNT_CORRECTION', 'DAMAGED', 'EXPIRED', 'LOST', 'STOLEN', 'FOUND', 'OTHER');

-- CreateTable
CREATE TABLE "business_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "business_name" VARCHAR(150) NOT NULL,
    "legal_name" VARCHAR(150),
    "tax_registration_number" VARCHAR(50),
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "address" TEXT,
    "logo_path" VARCHAR(255),
    "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
    "locale" VARCHAR(20) NOT NULL DEFAULT 'en-US',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "tax_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tax_label" VARCHAR(30) NOT NULL DEFAULT 'Tax',
    "default_tax_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "invoice_footer" TEXT,
    "default_low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "low_stock_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "allow_self_registration" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "document_type" "DocumentType" NOT NULL,
    "prefix" VARCHAR(10) NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("document_type")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" VARCHAR(100) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_key" VARCHAR(100) NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(30),
    "password_hash" VARCHAR(255) NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(50),
    "replaced_by_token_id" UUID,
    "created_by_ip" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "requested_ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(64),
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "barcode" VARCHAR(64),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'pcs',
    "cost_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "selling_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(7,4),
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "reorder_level" INTEGER,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "file_path" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contact_person" VARCHAR(100),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "address" TEXT,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "address" TEXT,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "purchase_number" VARCHAR(30) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "supplier_reference" VARCHAR(100),
    "expected_delivery_date" DATE,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_type" "DiscountType",
    "discount_value" DECIMAL(14,4),
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refunded_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "ordered_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancellation_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_name" VARCHAR(200) NOT NULL,
    "product_sku" VARCHAR(64) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocated_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" UUID NOT NULL,
    "receipt_number" VARCHAR(30) NOT NULL,
    "purchase_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_id" UUID NOT NULL,
    "notes" TEXT,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "purchase_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(30) NOT NULL,
    "invoice_number" VARCHAR(30),
    "customer_id" UUID,
    "customer_name" VARCHAR(150),
    "customer_phone" VARCHAR(30),
    "customer_address" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_type" "DiscountType",
    "discount_value" DECIMAL(14,4),
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refunded_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returned_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_name" VARCHAR(200) NOT NULL,
    "product_sku" VARCHAR(64) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocated_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "payment_number" VARCHAR(30) NOT NULL,
    "type" "PaymentType" NOT NULL,
    "order_id" UUID,
    "purchase_id" UUID,
    "sales_return_id" UUID,
    "payment_method_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" VARCHAR(100),
    "notes" TEXT,
    "reversed_payment_id" UUID,
    "idempotency_key" VARCHAR(100),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" UUID NOT NULL,
    "return_number" VARCHAR(30) NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "SalesReturnStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requested_by_id" UUID NOT NULL,
    "processed_by_id" UUID,
    "processed_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(500),
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" UUID NOT NULL,
    "sales_return_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" "ReturnItemCondition" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "previous_stock" INTEGER NOT NULL,
    "resulting_stock" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "purchase_receipt_id" UUID,
    "order_id" UUID,
    "sales_return_id" UUID,
    "adjustment_reason" "AdjustmentReason",
    "notes" TEXT,
    "idempotency_key" VARCHAR(100),
    "performed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "role_permissions_permission_key_idx" ON "role_permissions"("permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_token_id_key" ON "refresh_tokens"("replaced_by_token_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "categories_status_idx" ON "categories"("status");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_sku_trgm_idx" ON "products" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "suppliers_status_idx" ON "suppliers"("status");

-- CreateIndex
CREATE INDEX "suppliers_name_trgm_idx" ON "suppliers" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_name_trgm_idx" ON "customers" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_purchase_number_key" ON "purchases"("purchase_number");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_created_at_idx" ON "purchases"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE INDEX "purchases_payment_status_idx" ON "purchases"("payment_status");

-- CreateIndex
CREATE INDEX "purchases_ordered_at_idx" ON "purchases"("ordered_at");

-- CreateIndex
CREATE INDEX "purchases_created_at_idx" ON "purchases"("created_at");

-- CreateIndex
CREATE INDEX "purchase_items_product_id_idx" ON "purchase_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_purchase_id_product_id_key" ON "purchase_items"("purchase_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_purchase_id_line_no_key" ON "purchase_items"("purchase_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_receipt_number_key" ON "purchase_receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_idempotency_key_key" ON "purchase_receipts"("idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_receipts_purchase_id_idx" ON "purchase_receipts"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_received_at_idx" ON "purchase_receipts"("received_at");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_purchase_item_id_idx" ON "purchase_receipt_items"("purchase_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_items_receipt_id_purchase_item_id_key" ON "purchase_receipt_items"("receipt_id", "purchase_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_invoice_number_key" ON "orders"("invoice_number");

-- CreateIndex
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

-- CreateIndex
CREATE INDEX "orders_confirmed_at_idx" ON "orders"("confirmed_at");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_product_id_key" ON "order_items"("order_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_line_no_key" ON "order_items"("order_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_number_key" ON "payments"("payment_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reversed_payment_id_key" ON "payments"("reversed_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_purchase_id_idx" ON "payments"("purchase_id");

-- CreateIndex
CREATE INDEX "payments_sales_return_id_idx" ON "payments"("sales_return_id");

-- CreateIndex
CREATE INDEX "payments_payment_method_id_idx" ON "payments"("payment_method_id");

-- CreateIndex
CREATE INDEX "payments_type_paid_at_idx" ON "payments"("type", "paid_at");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_return_number_key" ON "sales_returns"("return_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_idempotency_key_key" ON "sales_returns"("idempotency_key");

-- CreateIndex
CREATE INDEX "sales_returns_order_id_idx" ON "sales_returns"("order_id");

-- CreateIndex
CREATE INDEX "sales_returns_status_idx" ON "sales_returns"("status");

-- CreateIndex
CREATE INDEX "sales_returns_processed_at_idx" ON "sales_returns"("processed_at");

-- CreateIndex
CREATE INDEX "sales_returns_created_at_idx" ON "sales_returns"("created_at");

-- CreateIndex
CREATE INDEX "sales_return_items_order_item_id_idx" ON "sales_return_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_items_sales_return_id_order_item_id_key" ON "sales_return_items"("sales_return_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_idempotency_key_key" ON "inventory_movements"("idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_created_at_idx" ON "inventory_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_type_created_at_idx" ON "inventory_movements"("type", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_order_id_product_id_type_key" ON "inventory_movements"("order_id", "product_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_purchase_receipt_id_product_id_key" ON "inventory_movements"("purchase_receipt_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_sales_return_id_product_id_key" ON "inventory_movements"("sales_return_id", "product_id");

-- AddForeignKey
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_token_id_fkey" FOREIGN KEY ("replaced_by_token_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_payment_id_fkey" FOREIGN KEY ("reversed_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================ CUSTOM SECTION ============================
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

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'SHIPPED';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "carrier" VARCHAR(100);
ALTER TABLE "orders" ADD COLUMN "tracking_number" VARCHAR(100);
ALTER TABLE "orders" ADD COLUMN "shipped_at" TIMESTAMPTZ(3);
ALTER TABLE "orders" ADD COLUMN "delivered_at" TIMESTAMPTZ(3);

-- Phase 6O.18.2 — Payment settlement & gateway invoice reconciliation

CREATE TYPE "PaymentSettlementType" AS ENUM ('DIRECT_TO_MERCHANT', 'GATEWAY_SETTLEMENT');
CREATE TYPE "PaymentGatewayInvoiceStatus" AS ENUM ('PENDING', 'MATCHED', 'DIFFERENCE');

ALTER TABLE "orders"
  ADD COLUMN "settlement_type" "PaymentSettlementType";

ALTER TABLE "payments"
  ADD COLUMN "method_code" VARCHAR(64),
  ADD COLUMN "settlement_type" "PaymentSettlementType";

UPDATE "orders"
SET "settlement_type" = CASE
  WHEN "payment_gateway" = 'MEGAPAY' THEN 'GATEWAY_SETTLEMENT'::"PaymentSettlementType"
  ELSE 'DIRECT_TO_MERCHANT'::"PaymentSettlementType"
END
WHERE "settlement_type" IS NULL AND "payment_gateway" IS NOT NULL;

UPDATE "payments" p
SET
  "method_code" = o."payment_method_code",
  "settlement_type" = o."settlement_type"
FROM "orders" o
WHERE p."order_id" = o."id"
  AND p."method_code" IS NULL;

CREATE TABLE "payment_gateway_invoices" (
  "id" UUID NOT NULL,
  "gateway_code" VARCHAR(64) NOT NULL,
  "period" VARCHAR(32) NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "total_transactions" INTEGER NOT NULL,
  "total_volume" DECIMAL(18,2) NOT NULL,
  "total_fee" DECIMAL(18,2) NOT NULL,
  "vat_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "invoice_number" VARCHAR(64),
  "status" "PaymentGatewayInvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "system_transactions" INTEGER,
  "system_volume" DECIMAL(18,2),
  "system_fee" DECIMAL(18,2),
  "notes" VARCHAR(512),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "payment_gateway_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateway_invoices_gateway_code_period_start_period_end_key"
  ON "payment_gateway_invoices"("gateway_code", "period_start", "period_end");
CREATE INDEX "payment_gateway_invoices_gateway_code_idx" ON "payment_gateway_invoices"("gateway_code");
CREATE INDEX "payment_gateway_invoices_status_idx" ON "payment_gateway_invoices"("status");
CREATE INDEX "orders_settlement_type_idx" ON "orders"("settlement_type");
CREATE INDEX "payments_settlement_type_idx" ON "payments"("settlement_type");

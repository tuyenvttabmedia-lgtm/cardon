-- Phase 6O.18 — transparent payment fee + order pricing snapshot

ALTER TABLE "orders"
  ADD COLUMN "face_value" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "sell_amount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_amount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "payment_method_code" VARCHAR(64),
  ADD COLUMN "payment_gateway" VARCHAR(64),
  ADD COLUMN "payment_fee_percent" DECIMAL(8, 4) NOT NULL DEFAULT 0,
  ADD COLUMN "payment_fee_fixed" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "payment_fee_amount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "customer_paid" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "provider_cost" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "profit" DECIMAL(18, 2) NOT NULL DEFAULT 0;

CREATE INDEX "orders_payment_method_code_idx" ON "orders"("payment_method_code");
CREATE INDEX "orders_payment_gateway_idx" ON "orders"("payment_gateway");

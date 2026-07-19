-- Phase 6O.18.3 — Payment reconciliation final fields

CREATE TYPE "PaymentReconciliationStatus" AS ENUM (
  'PENDING',
  'MATCHED',
  'DIFFERENCE',
  'MANUAL_REVIEW'
);

ALTER TABLE "payments"
  ADD COLUMN "gateway_transaction_id" VARCHAR(128),
  ADD COLUMN "bank_transaction_id" VARCHAR(128),
  ADD COLUMN "bank_reference" VARCHAR(128),
  ADD COLUMN "settlement_date" TIMESTAMPTZ(6),
  ADD COLUMN "reconciliation_status" "PaymentReconciliationStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "payments"
SET "gateway_transaction_id" = NULLIF("gateway_response"->>'gatewayTransactionId', '')
WHERE "gateway_transaction_id" IS NULL
  AND "gateway_response"->>'gatewayTransactionId' IS NOT NULL;

UPDATE "payments"
SET "settlement_date" = "paid_at"
WHERE "settlement_date" IS NULL
  AND "paid_at" IS NOT NULL;

CREATE INDEX "payments_gateway_transaction_id_idx" ON "payments"("gateway_transaction_id");
CREATE INDEX "payments_bank_reference_idx" ON "payments"("bank_reference");
CREATE INDEX "payments_settlement_date_idx" ON "payments"("settlement_date");
CREATE INDEX "payments_reconciliation_status_idx" ON "payments"("reconciliation_status");
